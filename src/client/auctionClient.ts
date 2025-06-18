import algosdk from 'algosdk';
import { 
  ApplicationClient, 
  AppSpec, 
  AlgorandClient
} from '@algorandfoundation/algokit-utils';
import { 
  AuctionInfo, 
  BidderEscrowInfo, 
  EscrowStatus, 
  CreateAuctionParams, 
  PlaceBidParams, 
  WithdrawBidParams,
  AuctionError,
  EscrowError,
  AUCTION_CONSTANTS
} from '../types';

const TRANSACTION_FEE = algosdk.microAlgosToAlgos(3000);
const MBR_AMOUNT = 200000; // 0.2 ALGO for MBR

export class AuctionClient {
  private algodClient: algosdk.Algodv2;
  private indexerClient: algosdk.Indexer;
  private signer: algosdk.TransactionSigner;
  private algoClient: AlgorandClient;
  private appSpec: AppSpec;

  constructor(
    algodClient: algosdk.Algodv2,
    indexerClient: algosdk.Indexer,
    signer: algosdk.TransactionSigner,
    appSpec?: AppSpec
  ) {
    this.algodClient = algodClient;
    this.indexerClient = indexerClient;
    this.signer = signer;
    this.algoClient = AlgorandClient.fromClients({ algod: algodClient, indexer: indexerClient });
    this.appSpec = appSpec || this.getDefaultAppSpec();
  }

  private getDefaultAppSpec(): AppSpec {
    // Replace with actual app spec
    return {
      hints: {},
      schema: {
        global: { declared: {}, reserved: {} },
        local: { declared: {}, reserved: {} }
      },
      state: {
        global: { num_byte_slices: 4, num_uints: 8 },
        local: { num_byte_slices: 0, num_uints: 0 }
      },
      source: { approval: '', clear: '' },
      contract: {
        name: 'TimedAuctionContract',
        description: 'Timed auction contract with escrow',
        methods: []
      }
    };
  }

  // Logs and throws an error with context
  private logAndThrowError(message: string, error: any, code: string, params: any = {}): never {
    console.error(`Error: ${message}`, { error, params });
    throw new AuctionError(message, code, params);
  }

  // Helper function to create payment transactions
  private createPaymentTxn(sender: string, recipient: string, amount: number, suggestedParams: any) {
    return algosdk.makePaymentTxnWithSuggestedParams(sender, recipient, amount, undefined, undefined, suggestedParams);
  }

  /**
   * Creates a new timed auction
   */
  async createAuction(params: CreateAuctionParams): Promise<number> {
    try {
      const { creator, assetId, floorPrice, durationInSeconds } = params;

      // Get suggested params
      const suggestedParams = await this.algodClient.getTransactionParams().do();
      const appClient = new ApplicationClient({
        app: this.appSpec,
        sender: { addr: creator, signer: this.signer },
        creatorAddress: creator,
        findExistingUsing: { creatorAddress: creator, name: 'TimedAuctionContract' },
      }, this.algoClient);

      // Deploy the auction contract
      const result = await appClient.deploy({
        createParams: {
          method: 'createApplication',
          methodArgs: [{ assetId }, floorPrice, durationInSeconds],
        },
      });

      const appId = Number(result.appId);
      console.log(`Auction created with appId: ${appId}`);

      // Fund the application account for MBR
      await this.fundAppAccount(appId, creator);

      return appId;
    } catch (error) {
      this.logAndThrowError('Failed to create auction', error, 'CREATE_AUCTION_ERROR', params);
    }
  }

  /**
   * Fund the app account with ALGO for minimum balance requirement (MBR)
   */
  private async fundAppAccount(appId: number, creator: string): Promise<void> {
    const appAddress = algosdk.getApplicationAddress(appId);
    const suggestedParams = await this.algodClient.getTransactionParams().do();

    const fundingTxn = this.createPaymentTxn(creator, appAddress, MBR_AMOUNT, suggestedParams);
    const signedTxn = await this.signer([fundingTxn], [0]);

    await this.algodClient.sendRawTransaction(signedTxn).do();
    console.log(`Funded appId: ${appId} with MBR amount`);
  }

  /**
   * Opt the auction contract into the asset
   */
  async optInToAsset(appId: number, creator: string, mbrAmount: number = MBR_AMOUNT): Promise<string> {
    try {
      const appClient = this.getAppClient(appId, creator);

      const suggestedParams = await this.algodClient.getTransactionParams().do();
      const appAddress = algosdk.getApplicationAddress(appId);
      const mbrPayment = this.createPaymentTxn(creator, appAddress, mbrAmount, suggestedParams);

      const result = await appClient.call({
        method: 'optInToAsset',
        methodArgs: [mbrPayment],
        staticFee: TRANSACTION_FEE, // Higher fee for group transaction
      });

      console.log(`Opted in to asset for appId: ${appId}`);
      return result.txIds[0];
    } catch (error) {
      this.logAndThrowError('Failed to opt into asset', error, 'OPT_IN_ERROR', { appId });
    }
  }

  /**
   * Place a bid on an auction
   */
  async placeBid(params: PlaceBidParams): Promise<string> {
    try {
      const { appId, bidder, bidAmount } = params;

      if (bidAmount <= 0) {
        throw new EscrowError('Bid amount must be greater than 0', appId);
      }

      const appClient = this.getAppClient(appId, bidder);
      const appAddress = algosdk.getApplicationAddress(appId);
      const suggestedParams = await this.algodClient.getTransactionParams().do();
      const bidPayment = this.createPaymentTxn(bidder, appAddress, bidAmount, suggestedParams);

      const result = await appClient.call({
        method: 'placeBid',
        methodArgs: [bidPayment],
        staticFee: TRANSACTION_FEE,
        boxes: [{ appId, name: algosdk.decodeAddress(bidder).publicKey }], // Box for bidder escrow
      });

      console.log(`Placed bid for appId: ${appId}, bidder: ${bidder}`);
      return result.txIds[0];
    } catch (error) {
      this.logAndThrowError('Failed to place bid', error, 'PLACE_BID_ERROR', { appId });
    }
  }

  /**
   * Get auction information
   */
  async getAuctionInfo(appId: number): Promise<AuctionInfo> {
    try {
      const appInfo = await this.algodClient.getApplicationByID(appId).do();

      if (!appInfo.params) {
        throw new AuctionError(`Auction ${appId} not found`, 'AUCTION_NOT_FOUND', appId);
      }

      const globalState = this.parseGlobalState(appInfo.params['global-state'] || []);
      const escrowStatus = await this.getEscrowStatus(appId);

      return {
        appId,
        assetId: globalState.assetId || 0,
        floorPrice: globalState.floorPrice || 0,
        highestBid: globalState.highestBid || 0,
        highestBidder: globalState.highestBidder || AUCTION_CONSTANTS.ZERO_ADDRESS,
        auctionEndTime: globalState.auctionEndTime || 0,
        creator: appInfo.params.creator,
        totalEscrowedAmount: escrowStatus.totalEscrowedAmount,
        activeBiddersCount: escrowStatus.activeBiddersCount,
        isEscrowActive: escrowStatus.isEscrowActive,
      };
    } catch (error) {
      this.logAndThrowError('Failed to get auction info', error, 'GET_AUCTION_INFO_ERROR', { appId });
    }
  }

  /**
   * Get escrow status for an auction
   */
  async getEscrowStatus(appId: number): Promise<EscrowStatus> {
    try {
      const appClient = this.getAppClient(appId, ''); // Empty sender for read-only
      const result = await appClient.call({ method: 'getEscrowStatus', methodArgs: [] });

      const [totalEscrowedAmount, activeBiddersCount, isEscrowActive] = result.return?.returnValue as [number, number, boolean];
      return { totalEscrowedAmount, activeBiddersCount, isEscrowActive };
    } catch (error) {
      this.logAndThrowError('Failed to get escrow status', error, 'ESCROW_STATUS_ERROR', { appId });
    }
  }

  /**
   * Helper method to parse the global state
   */
  private parseGlobalState(globalState: any[]): Record<string, any> {
    const parsed: Record<string, any> = {};

    for (const item of globalState) {
      const key = Buffer.from(item.key, 'base64').toString();
      let value: any;

      if (item.value.type === 1) { // bytes
        value = Buffer.from(item.value.bytes, 'base64').toString();
      } else if (item.value.type === 0) { // uint
        value = item.value.uint;
      }

      parsed[key] = value;
    }

    return parsed;
  }
}

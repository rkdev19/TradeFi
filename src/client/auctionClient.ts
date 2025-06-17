import algosdk from 'algosdk';
import { 
  ApplicationClient, 
  AppSpec, 
  AlgorandClient,
  AppCallTransactionResult 
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
  AUCTION_CONSTANTS,
  AuctionEvent,
  BidPlacedEvent,
  BidWithdrawnEvent
} from '../types';

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
    
    // Default app spec - in production, this should be imported from your compiled contract
    this.appSpec = appSpec || this.getDefaultAppSpec();
  }

  /**
   * Creates a new timed auction
   */
  async createAuction(params: CreateAuctionParams): Promise<number> {
    try {
      const { creator, assetId, floorPrice, durationInSeconds } = params;

      // Get suggested params
      const suggestedParams = await this.algodClient.getTransactionParams().do();

      // Create application client
      const appClient = new ApplicationClient(
        {
          app: this.appSpec,
          sender: { addr: creator, signer: this.signer },
          creatorAddress: creator,
          findExistingUsing: { creatorAddress: creator, name: 'TimedAuctionContract' },
        },
        this.algoClient
      );

      // Deploy the application
      const result = await appClient.deploy({
        createParams: {
          method: 'createApplication',
          methodArgs: [
            { assetId },
            floorPrice,
            durationInSeconds
          ],
        },
      });

      const appId = Number(result.appId);

      // Fund the application account for MBR
      await this.fundAppAccount(appId, creator);

      return appId;
    } catch (error) {
      throw new AuctionError(
        `Failed to create auction: ${error.message}`,
        'CREATE_AUCTION_ERROR'
      );
    }
  }

  /**
   * Opt the auction contract into the asset
   */
  async optInToAsset(appId: number, creator: string, mbrAmount: number = 100000): Promise<string> {
    try {
      const appClient = this.getAppClient(appId, creator);

      // Create MBR payment transaction
      const suggestedParams = await this.algodClient.getTransactionParams().do();
      const appAddress = algosdk.getApplicationAddress(appId);

      const mbrPayment = algosdk.makePaymentTxnWithSuggestedParams(
        creator,
        appAddress,
        mbrAmount,
        undefined,
        undefined,
        suggestedParams
      );

      const result = await appClient.call({
        method: 'optInToAsset',
        methodArgs: [mbrPayment],
        staticFee: algosdk.microAlgosToAlgos(3000), // Higher fee for group transaction
      });

      return result.txIds[0];
    } catch (error) {
      throw new AuctionError(
        `Failed to opt into asset: ${error.message}`,
        'OPT_IN_ERROR',
        appId
      );
    }
  }

  /**
   * Place a bid on an auction
   */
  async placeBid(params: PlaceBidParams): Promise<string> {
    try {
      const { appId, bidder, bidAmount } = params;

      // Validate bid amount
      if (bidAmount <= 0) {
        throw new EscrowError('Bid amount must be greater than 0', appId);
      }

      const appClient = this.getAppClient(appId, bidder);
      const appAddress = algosdk.getApplicationAddress(appId);

      // Create bid payment transaction
      const suggestedParams = await this.algodClient.getTransactionParams().do();
      const bidPayment = algosdk.makePaymentTxnWithSuggestedParams(
        bidder,
        appAddress,
        bidAmount,
        undefined,
        undefined,
        suggestedParams
      );

      const result = await appClient.call({
        method: 'placeBid',
        methodArgs: [bidPayment],
        staticFee: algosdk.microAlgosToAlgos(2000),
        boxes: [{ appId, name: algosdk.decodeAddress(bidder).publicKey }], // Box for bidder escrow
      });

      return result.txIds[0];
    } catch (error) {
      throw new EscrowError(
        `Failed to place bid: ${error.message}`,
        appId
      );
    }
  }

  /**
   * Withdraw a bid from escrow
   */
  async withdrawBid(params: WithdrawBidParams): Promise<string> {
    try {
      const { appId, bidder } = params;

      // Check if withdrawal is allowed
      const canWithdraw = await this.canWithdrawBid(appId, bidder);
      if (!canWithdraw) {
        throw new EscrowError('Cannot withdraw bid at this time', appId);
      }

      const appClient = this.getAppClient(appId, bidder);

      const result = await appClient.call({
        method: 'withdrawBid',
        methodArgs: [],
        staticFee: algosdk.microAlgosToAlgos(2000),
        boxes: [{ appId, name: algosdk.decodeAddress(bidder).publicKey }],
      });

      return result.txIds[0];
    } catch (error) {
      throw new EscrowError(
        `Failed to withdraw bid: ${error.message}`,
        appId
      );
    }
  }

  /**
   * Finalize an auction (after end time)
   */
  async finalizeAuction(appId: number, sender: string): Promise<string> {
    try {
      const appClient = this.getAppClient(appId, sender);

      const result = await appClient.call({
        method: 'finalizeAuction',
        methodArgs: [],
        staticFee: algosdk.microAlgosToAlgos(3000),
      });

      return result.txIds[0];
    } catch (error) {
      throw new AuctionError(
        `Failed to finalize auction: ${error.message}`,
        'FINALIZE_ERROR',
        appId
      );
    }
  }

  /**
   * Accept the current highest bid (creator only)
   */
  async acceptBid(appId: number, creator: string): Promise<string> {
    try {
      const appClient = this.getAppClient(appId, creator);

      const result = await appClient.call({
        method: 'acceptBid',
        methodArgs: [],
        staticFee: algosdk.microAlgosToAlgos(3000),
      });

      return result.txIds[0];
    } catch (error) {
      throw new AuctionError(
        `Failed to accept bid: ${error.message}`,
        'ACCEPT_BID_ERROR',
        appId
      );
    }
  }

  /**
   * Reject all bids (creator only)
   */
  async rejectBid(appId: number, creator: string): Promise<string> {
    try {
      const appClient = this.getAppClient(appId, creator);

      const result = await appClient.call({
        method: 'rejectBid',
        methodArgs: [],
        staticFee: algosdk.microAlgosToAlgos(2000),
      });

      return result.txIds[0];
    } catch (error) {
      throw new AuctionError(
        `Failed to reject bid: ${error.message}`,
        'REJECT_BID_ERROR',
        appId
      );
    }
  }

  /**
   * Get detailed auction information
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
      throw new AuctionError(
        `Failed to get auction info: ${error.message}`,
        'GET_AUCTION_INFO_ERROR',
        appId
      );
    }
  }

  /**
   * Get escrow status for an auction
   */
  async getEscrowStatus(appId: number): Promise<EscrowStatus> {
    try {
      const appClient = this.getAppClient(appId, ''); // Empty sender for read-only

      const result = await appClient.call({
        method: 'getEscrowStatus',
        methodArgs: [],
      });

      // Parse the returned tuple [totalEscrowedAmount, activeBiddersCount, isEscrowActive]
      const [totalEscrowedAmount, activeBiddersCount, isEscrowActive] = result.return?.returnValue as [number, number, boolean];

      return {
        totalEscrowedAmount,
        activeBiddersCount,
        isEscrowActive,
      };
    } catch (error) {
      throw new EscrowError(
        `Failed to get escrow status: ${error.message}`,
        appId
      );
    }
  }

  /**
   * Get bidder's escrowed amount
   */
  async getBidderEscrow(appId: number, bidder: string): Promise<number> {
    try {
      const appClient = this.getAppClient(appId, '');

      const result = await appClient.call({
        method: 'getBidderEscrow',
        methodArgs: [bidder],
        boxes: [{ appId, name: algosdk.decodeAddress(bidder).publicKey }],
      });

      return result.return?.returnValue as number || 0;
    } catch (error) {
      // Return 0 if bidder has no escrow (box doesn't exist)
      return 0;
    }
  }

  /**
   * Check if a bidder can withdraw their bid
   */
  async canWithdrawBid(appId: number, bidder: string): Promise<boolean> {
    try {
      const auctionInfo = await this.getAuctionInfo(appId);
      const currentRound = (await this.algodClient.status().do())['last-round'];
      
      // Can withdraw if:
      // 1. Escrow is not active (auction ended/rejected), OR
      // 2. Not the highest bidder and auction is still active
      if (!auctionInfo.isEscrowActive) {
        return true;
      }

      if (auctionInfo.highestBidder !== bidder && currentRound <= auctionInfo.auctionEndTime) {
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * List all active auctions
   */
  async listActiveAuctions(creatorFilter?: string): Promise<AuctionInfo[]> {
    try {
      let searchParams: any = {
        'application-id': 0, // Search all applications
      };

      if (creatorFilter) {
        searchParams.creator = creatorFilter;
      }

      const response = await this.indexerClient.searchForApplications(searchParams).do();
      const activeAuctions: AuctionInfo[] = [];

      for (const app of response.applications || []) {
        try {
          const auctionInfo = await this.getAuctionInfo(app.id);
          
          // Check if auction is still active
          const currentRound = (await this.algodClient.status().do())['last-round'];
          if (auctionInfo.isEscrowActive && currentRound <= auctionInfo.auctionEndTime) {
            activeAuctions.push(auctionInfo);
          }
        } catch (error) {
          // Skip applications that aren't auction contracts
          continue;
        }
      }

      return activeAuctions;
    } catch (error) {
      throw new AuctionError(
        `Failed to list active auctions: ${error.message}`,
        'LIST_AUCTIONS_ERROR'
      );
    }
  }

  /**
   * Get all bidder escrows for an auction
   */
  async getAllBidderEscrows(appId: number): Promise<BidderEscrowInfo[]> {
    try {
      const auctionInfo = await this.getAuctionInfo(appId);
      const bidderEscrows: BidderEscrowInfo[] = [];

      // Get all boxes for this application
      const boxesResponse = await this.algodClient.getApplicationBoxes(appId).do();
      
      for (const box of boxesResponse.boxes || []) {
        try {
          const bidderAddress = algosdk.encodeAddress(box.name);
          const escrowedAmount = await this.getBidderEscrow(appId, bidderAddress);
          
          if (escrowedAmount > 0) {
            bidderEscrows.push({
              bidder: bidderAddress,
              escrowedAmount,
              isHighestBidder: bidderAddress === auctionInfo.highestBidder,
            });
          }
        } catch (error) {
          // Skip invalid boxes
          continue;
        }
      }

      return bidderEscrows.sort((a, b) => b.escrowedAmount - a.escrowedAmount);
    } catch (error) {
      throw new EscrowError(
        `Failed to get all bidder escrows: ${error.message}`,
        appId
      );
    }
  }

  /**
   * Emergency refund all bidders (creator only)
   */
  async refundAllBidders(appId: number, creator: string): Promise<string> {
    try {
      const appClient = this.getAppClient(appId, creator);

      const result = await appClient.call({
        method: 'refundAllBidders',
        methodArgs: [],
        staticFee: algosdk.microAlgosToAlgos(2000),
      });

      return result.txIds[0];
    } catch (error) {
      throw new AuctionError(
        `Failed to refund all bidders: ${error.message}`,
        'REFUND_ERROR',
        appId
      );
    }
  }

  /**
   * Set floor price (creator only)
   */
  async setFloorPrice(appId: number, creator: string, newFloorPrice: number): Promise<string> {
    try {
      const appClient = this.getAppClient(appId, creator);

      const result = await appClient.call({
        method: 'setFloorPrice',
        methodArgs: [newFloorPrice],
        staticFee: algosdk.microAlgosToAlgos(1000),
      });

      return result.txIds[0];
    } catch (error) {
      throw new AuctionError(
        `Failed to set floor price: ${error.message}`,
        'SET_FLOOR_PRICE_ERROR',
        appId
      );
    }
  }

  /**
   * Delete auction application (creator only)
   */
  async deleteAuction(appId: number, creator: string): Promise<string> {
    try {
      const appClient = this.getAppClient(appId, creator);

      const result = await appClient.call({
        method: 'deleteApplication',
        methodArgs: [],
        staticFee: algosdk.microAlgosToAlgos(3000),
      });

      return result.txIds[0];
    } catch (error) {
      throw new AuctionError(
        `Failed to delete auction: ${error.message}`,
        'DELETE_AUCTION_ERROR',
        appId
      );
    }
  }

  // Private helper methods

  private getAppClient(appId: number, sender: string): ApplicationClient {
    return new ApplicationClient(
      {
        app: this.appSpec,
        sender: { addr: sender, signer: this.signer },
        appId: BigInt(appId),
      },
      this.algoClient
    );
  }

  private async fundAppAccount(appId: number, creator: string): Promise<void> {
    const appAddress = algosdk.getApplicationAddress(appId);
    const suggestedParams = await this.algodClient.getTransactionParams().do();

    // Fund for MBR (minimum balance requirement)
    const fundingTxn = algosdk.makePaymentTxnWithSuggestedParams(
      creator,
      appAddress,
      200000, // 0.2 ALGO for MBR
      undefined,
      undefined,
      suggestedParams
    );

    const signedTxn = await this.signer([fundingTxn], [0]);
    await this.algodClient.sendRawTransaction(signedTxn).do();
  }

  private parseGlobalState(globalState: any[]): Record<string, any> {
    const parsed: Record<string, any> = {};

    for (const item of globalState) {
      const key = Buffer.from(item.key, 'base64').toString();
      let value: any;

      if (item.value.type === 1) { // bytes
        value = Buffer.from(item.value.bytes, 'base64');
        // Try to decode as address
        if (value.length === 32) {
          try {
            value = algosdk.encodeAddress(value);
          } catch {
            // Keep as buffer if not a valid address
          }
        }
      } else if (item.value.type === 2) { // uint
        value = item.value.uint;
      }

      parsed[key] = value;
    }

    return parsed;
  }

  private getDefaultAppSpec(): AppSpec {
    // This should be replaced with your actual compiled app spec
    // For now, returning a minimal spec structure
    return {
      hints: {},
      schema: {
        global: {
          declared: {},
          reserved: {}
        },
        local: {
          declared: {},
          reserved: {}
        }
      },
      state: {
        global: {
          num_byte_slices: 4,
          num_uints: 8
        },
        local: {
          num_byte_slices: 0,
          num_uints: 0
        }
      },
      source: {
        approval: '',
        clear: ''
      },
      contract: {
        name: 'TimedAuctionContract',
        description: 'Timed auction contract with escrow',
        methods: []
      }
    };
  }
}

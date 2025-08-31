import algosdk, { Algodv2, Indexer, TransactionSigner } from "algosdk";
import {
  ApplicationClient,
  AppSpec,
  AlgorandClient,
} from "@algorandfoundation/algokit-utils";
import {
  AuctionInfo,
  EscrowStatus,
  CreateAuctionParams,
  PlaceBidParams,
  WithdrawBidParams,
  AuctionError,
  EscrowError,
  AUCTION_CONSTANTS,
} from "../types";

const TRANSACTION_FEE = algosdk.microAlgosToAlgos(3000);
const MBR_AMOUNT = 200_000; // 0.2 ALGO for MBR

export class AuctionClient {
  private algod: Algodv2;
  private indexer: Indexer;
  private signer: TransactionSigner;
  private algoClient: AlgorandClient;
  private appSpec: AppSpec;

  constructor(
    algodClient: Algodv2,
    indexerClient: Indexer,
    signer: TransactionSigner,
    appSpec?: AppSpec
  ) {
    this.algod = algodClient;
    this.indexer = indexerClient;
    this.signer = signer;
    this.algoClient = AlgorandClient.fromClients({
      algod: algodClient,
      indexer: indexerClient,
    });
    this.appSpec = appSpec ?? this.getDefaultAppSpec();
  }

  // =========================
  // Helpers
  // =========================

  private getDefaultAppSpec(): AppSpec {
    return {
      hints: {},
      schema: {
        global: { declared: {}, reserved: {} },
        local: { declared: {}, reserved: {} },
      },
      state: {
        global: { num_byte_slices: 4, num_uints: 8 },
        local: { num_byte_slices: 0, num_uints: 0 },
      },
      source: { approval: "", clear: "" },
      contract: {
        name: "TimedAuctionContract",
        description: "Timed auction contract with escrow",
        methods: [],
      },
    };
  }

  /** Wraps async calls with error handling */
  private async withErrorHandling<T>(
    action: string,
    code: string,
    fn: () => Promise<T>,
    params: any = {}
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      console.error(`Error: ${action}`, { error, params });
      throw new AuctionError(action, code, params?.appId);
    }
  }

  /** Returns an ApplicationClient for a given appId + sender */
  private getAppClient(appId: number, sender: string) {
    return new ApplicationClient(
      {
        appId,
        app: this.appSpec,
        sender: sender ? { addr: sender, signer: this.signer } : undefined,
      },
      this.algoClient
    );
  }

  /** Creates a payment transaction */
  private createPaymentTxn(
    sender: string,
    recipient: string,
    amount: number,
    suggestedParams: any
  ) {
    return algosdk.makePaymentTxnWithSuggestedParams(
      sender,
      recipient,
      amount,
      undefined,
      undefined,
      suggestedParams
    );
  }

  /** Parse TEAL global state into key-value pairs */
  private parseGlobalState(globalState: any[]): Record<string, any> {
    return Object.fromEntries(
      globalState.map((item) => {
        const key = Buffer.from(item.key, "base64").toString();
        const value =
          item.value.type === 1
            ? Buffer.from(item.value.bytes, "base64").toString()
            : item.value.uint;
        return [key, value];
      })
    );
  }

  // =========================
  // Core Auction Methods
  // =========================

  /** Deploy a new auction smart contract */
  async createAuction(params: CreateAuctionParams): Promise<number> {
    return this.withErrorHandling(
      "Failed to create auction",
      "CREATE_AUCTION_ERROR",
      async () => {
        const { creator, assetId, floorPrice, durationInSeconds } = params;

        const appClient = new ApplicationClient(
          {
            app: this.appSpec,
            sender: { addr: creator, signer: this.signer },
            creatorAddress: creator,
            findExistingUsing: {
              creatorAddress: creator,
              name: "TimedAuctionContract",
            },
          },
          this.algoClient
        );

        // Deploy auction contract
        const result = await appClient.deploy({
          createParams: {
            method: "createApplication",
            methodArgs: [{ assetId }, floorPrice, durationInSeconds],
          },
        });

        const appId = Number(result.appId);
        console.log(`Auction created with appId: ${appId}`);

        // Fund MBR
        await this.fundAppAccount(appId, creator);
        return appId;
      },
      params
    );
  }

  /** Fund app account with ALGO for MBR */
  private async fundAppAccount(appId: number, creator: string): Promise<void> {
    const appAddress = algosdk.getApplicationAddress(appId);
    const suggestedParams = await this.algod.getTransactionParams().do();

    const fundingTxn = this.createPaymentTxn(
      creator,
      appAddress,
      MBR_AMOUNT,
      suggestedParams
    );
    const signedTxn = await this.signer([fundingTxn], [0]);
    await this.algod.sendRawTransaction(signedTxn).do();

    console.log(`Funded appId: ${appId} with MBR`);
  }

  /** Opt the auction contract into its asset */
  async optInToAsset(
    appId: number,
    creator: string,
    mbrAmount: number = MBR_AMOUNT
  ): Promise<string> {
    return this.withErrorHandling(
      "Failed to opt into asset",
      "OPT_IN_ERROR",
      async () => {
        const appClient = this.getAppClient(appId, creator);
        const suggestedParams = await this.algod.getTransactionParams().do();
        const appAddress = algosdk.getApplicationAddress(appId);

        const mbrPayment = this.createPaymentTxn(
          creator,
          appAddress,
          mbrAmount,
          suggestedParams
        );

        const result = await appClient.call({
          method: "optInToAsset",
          methodArgs: [mbrPayment],
          staticFee: TRANSACTION_FEE,
        });

        console.log(`Opted in to asset for appId: ${appId}`);
        return result.txIds[0];
      },
      { appId }
    );
  }

  /** Place a bid */
  async placeBid(params: PlaceBidParams): Promise<string> {
    return this.withErrorHandling(
      "Failed to place bid",
      "PLACE_BID_ERROR",
      async () => {
        const { appId, bidder, bidAmount } = params;

        if (bidAmount <= 0) {
          throw new EscrowError("Bid amount must be > 0", appId);
        }

        const appClient = this.getAppClient(appId, bidder);
        const appAddress = algosdk.getApplicationAddress(appId);
        const suggestedParams = await this.algod.getTransactionParams().do();

        const bidPayment = this.createPaymentTxn(
          bidder,
          appAddress,
          bidAmount,
          suggestedParams
        );

        const result = await appClient.call({
          method: "placeBid",
          methodArgs: [bidPayment],
          staticFee: TRANSACTION_FEE,
          boxes: [
            { appId, name: algosdk.decodeAddress(bidder).publicKey }, // bidder escrow box
          ],
        });

        console.log(`Placed bid: appId=${appId}, bidder=${bidder}`);
        return result.txIds[0];
      },
      { appId }
    );
  }

  /** Get auction details */
  async getAuctionInfo(appId: number): Promise<AuctionInfo> {
    return this.withErrorHandling(
      "Failed to get auction info",
      "GET_AUCTION_INFO_ERROR",
      async () => {
        const appInfo = await this.algod.getApplicationByID(appId).do();

        if (!appInfo.params) {
          throw new AuctionError("Auction not found", "AUCTION_NOT_FOUND", appId);
        }

        const globalState = this.parseGlobalState(
          appInfo.params["global-state"] || []
        );
        const escrowStatus = await this.getEscrowStatus(appId);

        return {
          appId,
          assetId: globalState.assetId || 0,
          floorPrice: globalState.floorPrice || 0,
          highestBid: globalState.highestBid || 0,
          highestBidder:
            globalState.highestBidder || AUCTION_CONSTANTS.ZERO_ADDRESS,
          auctionEndTime: globalState.auctionEndTime || 0,
          creator: appInfo.params.creator,
          totalEscrowedAmount: escrowStatus.totalEscrowedAmount,
          activeBiddersCount: escrowStatus.activeBiddersCount,
          isEscrowActive: escrowStatus.isEscrowActive,
        };
      },
      { appId }
    );
  }

  /** Get escrow status */
  async getEscrowStatus(appId: number): Promise<EscrowStatus> {
    return this.withErrorHandling(
      "Failed to get escrow status",
      "ESCROW_STATUS_ERROR",
      async () => {
        const appClient = this.getAppClient(appId, "");
        const result = await appClient.call({
          method: "getEscrowStatus",
          methodArgs: [],
        });

        const [totalEscrowedAmount, activeBiddersCount, isEscrowActive] =
          (result.return?.returnValue as [number, number, boolean]) ?? [
            0, 0, false,
          ];

        return { totalEscrowedAmount, activeBiddersCount, isEscrowActive };
      },
      { appId }
    );
  }
}

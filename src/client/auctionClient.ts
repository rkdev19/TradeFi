import algosdk from 'algosdk';
import { AlgorandClient } from '@algorandfoundation/algokit-utils';
import { AuctionInfo, AuctionCreateParams, BidParams } from '../types';

// Import the contract clients that would be generated from your smart contract
import { TimedAuctionContractClient, TimedAuctionContractFactory } from '../contracts/timedAuction.client';

export class AuctionClient {
  private algodClient: algosdk.Algodv2;
  private indexerClient: algosdk.Indexer;
  private signer: algosdk.TransactionSigner;
  private algoClient: AlgorandClient;

  constructor(
    algodClient: algosdk.Algodv2,
    indexerClient: algosdk.Indexer,
    signer: algosdk.TransactionSigner
  ) {
    this.algodClient = algodClient;
    this.indexerClient = indexerClient;
    this.signer = signer;
    this.algoClient = AlgorandClient.fromClients({ algod: algodClient, indexer: indexerClient });
  }

  /**
   * Creates a new timed auction for an asset
   */
  async createAuction(params: AuctionCreateParams): Promise<number> {
    const { creator, assetId, floorPrice, durationInSeconds } = params;

    // Get application client factory
    const factory = this.algoClient.client.getTypedAppFactory(TimedAuctionContractFactory, {
      sender: creator,
      signer: this.signer
    });

    // Create the auction application
    const { appId } = await factory.create({
      assetId,
      floorPrice,
      auctionDurationSeconds: durationInSeconds
    });

    return appId;
  }

  /**
   * Places a bid on an auction
   */
  async placeBid(params: BidParams): Promise<string> {
    const { appId, bidder, bidAmount } = params;

    // Get application client
    const appClient = this.algoClient.client.getTypedAppClient(
      TimedAuctionContractClient,
      appId,
      { sender: bidder, signer: this.signer }
    );

    // Get suggested parameters
    const suggestedParams = await this.algodClient.getTransactionParams().do();

    // Create payment transaction
    const paymentTxn = algosdk.makePaymentTxnWithSuggestedParams(
      bidder,
      algosdk.getApplicationAddress(appId),
      bidAmount,
      undefined,
      undefined,
      suggestedParams
    );

    // Call placeBid method
    const result = await appClient.placeBid({ bidPayment: paymentTxn });

    return result.txID;
  }

  /**
   * Finalizes an auction after its end time
   */
  async finalizeAuction(appId: number, sender: string): Promise<string> {
    // Get application client
    const appClient = this.algoClient.client.getTypedAppClient(
      TimedAuctionContractClient,
      appId,
      { sender, signer: this.signer }
    );

    // Call finalizeAuction method
    const result = await appClient.finalizeAuction();

    return result.txID;
  }

  /**
   * Accepts the highest bid (only callable by creator)
   */
  async acceptBid(appId: number, creator: string): Promise<string> {
    // Get application client
    const appClient = this.algoClient.client.getTypedAppClient(
      TimedAuctionContractClient,
      appId,
      { sender: creator, signer: this.signer }
    );

    // Call acceptBid method
    const result = await appClient.acceptBid();

    return result.txID;
  }

  /**
   * Rejects the highest bid (only callable by creator)
   */
  async rejectBid(appId: number, creator: string): Promise<string> {
    // Get application client
    const appClient = this.algoClient.client.getTypedAppClient(
      TimedAuctionContractClient,
      appId,
      { sender: creator, signer: this.signer }
    );

    // Call rejectBid method
    const result = await appClient.rejectBid();

    return result.txID;
  }

  /**
   * Gets information about an auction
   */
  async getAuctionInfo(appId: number): Promise<AuctionInfo> {
    // Get application information from indexer
    const appInfo = await this.indexerClient.lookupApplications(appId).do();

    if (!appInfo.application) {
      throw new Error(`Application ${appId} not found`);
    }

    // Extract global state
    const globalState = appInfo.application.params['global-state'] || [];

    // Helper to decode state values
    const getStateValue = (key: string) => {
      const encodedKey = Buffer.from(key).toString('base64');
      const stateItem = globalState.find((item: any) => item.key === encodedKey);

      if (!stateItem) return null;

      if (stateItem.value.type === 1) {
        return Buffer.from(stateItem.value.bytes, 'base64').toString();
      } else {
        return stateItem.value.uint;
      }
    };

    // Get current round
    const status = await this.algodClient.status().do();
    const currentRound = status['last-round'];

    // Extract auction information
    const assetId = getStateValue('assetId') || 0;
    const floorPrice = getStateValue('floorPrice') || 0;
    const highestBid = getStateValue('highestBid') || 0;
    const highestBidder = getStateValue('highestBidder') || '';
    const endTime = getStateValue('auctionEndTime') || 0;

    return {
      appId,
      assetId,
      floorPrice,
      highestBid,
      highestBidder,
      endTime,
      isActive: currentRound <= endTime,
      creator: appInfo.application.params.creator
    };
  }

  /**
   * Lists all active auctions
   */
  async listActiveAuctions(): Promise<AuctionInfo[]> {
    // This is a simplified implementation
    // In a real-world scenario, you would need to implement indexing or use a database

    // Get current round
    const status = await this.algodClient.status().do();
    const currentRound = status['last-round'];

    // Search for applications with our app signature
    const apps = await this.indexerClient.searchForApplications({
      // filters are yet to be set
    }).do();

    const auctions: AuctionInfo[] = [];

    // Process each application
    for (const app of apps.applications || []) {
      try {
        const auctionInfo = await this.getAuctionInfo(app.id);
        if (auctionInfo.isActive) {
          auctions.push(auctionInfo);
        }
      } catch (error) {
        // Skip apps that aren't our auction apps
        continue;
      }
    }

    return auctions;
  }
}

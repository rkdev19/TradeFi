import algosdk from 'algosdk';
import { AlgorandClient } from '@algorandfoundation/algokit-utils';
import { AssetInfo } from '../types';
import { AuctionClient } from './auctionClient';

export class MarketplaceClient {
  private algodClient: algosdk.Algodv2;
  private indexerClient: algosdk.Indexer;
  private signer: algosdk.TransactionSigner;
  private algoClient: AlgorandClient;
  public auction: AuctionClient;

  constructor(
    algodClient: algosdk.Algodv2,
    indexerClient: algosdk.Indexer,
    signer: algosdk.TransactionSigner
  ) {
    this.algodClient = algodClient;
    this.indexerClient = indexerClient;
    this.signer = signer;
    this.algoClient = AlgorandClient.fromClients({ algod: algodClient, indexer: indexerClient });
    this.auction = new AuctionClient(algodClient, indexerClient, signer);
  }

  /**
   * Creates a new ASA (Algorand Standard Asset)
   */
  async createAsset(
    creator: string,
    name: string,
    unitName: string,
    totalSupply: number = 1,
    decimals: number = 0,
    url?: string,
    metadataHash?: Uint8Array
  ): Promise<number> {
    const suggestedParams = await this.algodClient.getTransactionParams().do();

    const txn = algosdk.makeAssetCreateTxnWithSuggestedParams(
      creator,
      undefined, // note
      totalSupply,
      decimals,
      false, // defaultFrozen
      undefined, // manager
      undefined, // reserve
      undefined, // freeze
      undefined, // clawback
      unitName,
      name,
      url,
      metadataHash,
      suggestedParams
    );

    const signedTxn = await this.signer([txn], [0]);
    const response = await this.algodClient.sendRawTransaction(signedTxn).do();

    // Wait for confirmation
    const result = await algosdk.waitForConfirmation(this.algodClient, response.txId, 5);

    return result['asset-index'];
  }

  /**
   * Opt-in to an asset
   */
  async optInToAsset(account: string, assetId: number): Promise<string> {
    const suggestedParams = await this.algodClient.getTransactionParams().do();

    const txn = algosdk.makeAssetTransferTxnWithSuggestedParams(
      account,
      account,
      undefined, // close to
      undefined, // revocation target
      0, // amount (0 for opt-in)
      undefined, // note
      assetId,
      suggestedParams
    );

    const signedTxn = await this.signer([txn], [0]);
    const response = await this.algodClient.sendRawTransaction(signedTxn).do();

    // Wait for confirmation
    await algosdk.waitForConfirmation(this.algodClient, response.txId, 5);

    return response.txId;
  }

  /**
   * Transfer an asset
   */
  async transferAsset(
    sender: string,
    receiver: string,
    assetId: number,
    amount: number = 1
  ): Promise<string> {
    const suggestedParams = await this.algodClient.getTransactionParams().do();

    const txn = algosdk.makeAssetTransferTxnWithSuggestedParams(
      sender,
      receiver,
      undefined, // close to
      undefined, // revocation target
      amount,
      undefined, // note
      assetId,
      suggestedParams
    );

    const signedTxn = await this.signer([txn], [0]);
    const response = await this.algodClient.sendRawTransaction(signedTxn).do();

    // Wait for confirmation
    await algosdk.waitForConfirmation(this.algodClient, response.txId, 5);

    return response.txId;
  }

  /**
   * Get asset information
   */
  async getAssetInfo(assetId: number): Promise<AssetInfo> {
    const assetInfo = await this.indexerClient.lookupAssetByID(assetId).do();

    if (!assetInfo.asset) {
      throw new Error(`Asset ${assetId} not found`);
    }

    const asset = assetInfo.asset;

    return {
      id: asset.index,
      name: asset.params.name || '',
      url: asset.params.url,
      totalSupply: asset.params.total,
      decimals: asset.params.decimals,
      creator: asset.params.creator
    };
  }

  /**
   * Check if an account is opted in to an asset
   */
  async isOptedInToAsset(account: string, assetId: number): Promise<boolean> {
    try {
      const accountInfo = await this.indexerClient.lookupAccountAssets(account).assetId(assetId).do();
      return accountInfo.assets && accountInfo.assets.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get account's balance for a specific asset
   */
  async getAssetBalance(account: string, assetId: number): Promise<number> {
    try {
      const accountInfo = await this.indexerClient.lookupAccountAssets(account).assetId(assetId).do();
      
      if (!accountInfo.assets || accountInfo.assets.length === 0) {
        return 0;
      }

      return accountInfo.assets[0].amount;
    } catch (error) {
      throw new Error(`Failed to get asset balance: ${error}`);
    }
  }

  /**
   * Get account's ALGO balance
   */
  async getAlgoBalance(account: string): Promise<number> {
    try {
      const accountInfo = await this.algodClient.accountInformation(account).do();
      return accountInfo.amount;
    } catch (error) {
      throw new Error(`Failed to get ALGO balance: ${error}`);
    }
  }

  /**
   * Get all assets owned by an account
   */
  async getAccountAssets(account: string): Promise<AssetInfo[]> {
    try {
      const accountInfo = await this.indexerClient.lookupAccountAssets(account).do();
      
      if (!accountInfo.assets) {
        return [];
      }

      const assets: AssetInfo[] = [];
      
      for (const asset of accountInfo.assets) {
        if (asset.amount > 0) {
          try {
            const assetInfo = await this.getAssetInfo(asset['asset-id']);
            assets.push({
              ...assetInfo,
              balance: asset.amount
            });
          } catch (error) {
            // Skip assets that can't be looked up
            continue;
          }
        }
      }

      return assets;
    } catch (error) {
      throw new Error(`Failed to get account assets: ${error}`);
    }
  }

  /**
   * Batch opt-in to multiple assets
   */
  async batchOptInToAssets(account: string, assetIds: number[]): Promise<string[]> {
    const suggestedParams = await this.algodClient.getTransactionParams().do();
    const txns: algosdk.Transaction[] = [];
    const txIds: string[] = [];

    for (const assetId of assetIds) {
      // Check if already opted in
      const isOptedIn = await this.isOptedInToAsset(account, assetId);
      if (isOptedIn) {
        continue;
      }

      const txn = algosdk.makeAssetTransferTxnWithSuggestedParams(
        account,
        account,
        undefined, // close to
        undefined, // revocation target
        0, // amount (0 for opt-in)
        undefined, // note
        assetId,
        suggestedParams
      );

      txns.push(txn);
    }

    if (txns.length === 0) {
      return [];
    }

    // Group transactions if there are multiple
    if (txns.length > 1) {
      algosdk.assignGroupID(txns);
    }

    const signedTxns = await this.signer(txns, Array.from({ length: txns.length }, (_, i) => i));
    
    for (const signedTxn of signedTxns) {
      const response = await this.algodClient.sendRawTransaction(signedTxn).do();
      txIds.push(response.txId);
    }

    // Wait for all confirmations
    for (const txId of txIds) {
      await algosdk.waitForConfirmation(this.algodClient, txId, 5);
    }

    return txIds;
  }

  /**
   * Search for assets by name or unit name
   */
  async searchAssets(query: string, limit: number = 10): Promise<AssetInfo[]> {
    try {
      const response = await this.indexerClient
        .searchForAssets()
        .name(query)
        .limit(limit)
        .do();

      if (!response.assets) {
        return [];
      }

      return response.assets.map((asset: any) => ({
        id: asset.index,
        name: asset.params.name || '',
        unitName: asset.params['unit-name'] || '',
        url: asset.params.url,
        totalSupply: asset.params.total,
        decimals: asset.params.decimals,
        creator: asset.params.creator
      }));
    } catch (error) {
      throw new Error(`Failed to search assets: ${error}`);
    }
  }

  /**
   * Get recent transactions for an account
   */
  async getAccountTransactions(
    account: string, 
    limit: number = 10,
    assetId?: number
  ): Promise<any[]> {
    try {
      let query = this.indexerClient
        .lookupAccountTransactions(account)
        .limit(limit);

      if (assetId) {
        query = query.assetId(assetId);
      }

      const response = await query.do();
      return response.transactions || [];
    } catch (error) {
      throw new Error(`Failed to get account transactions: ${error}`);
    }
  }

  /**
   * Utility method to format microAlgos to Algos
   */
  static microAlgosToAlgos(microAlgos: number): number {
    return microAlgos / 1_000_000;
  }

  /**
   * Utility method to format Algos to microAlgos
   */
  static algosToMicroAlgos(algos: number): number {
    return Math.round(algos * 1_000_000);
  }

  /**
   * Get suggested transaction parameters
   */
  async getSuggestedParams(): Promise<algosdk.SuggestedParams> {
    return await this.algodClient.getTransactionParams().do();
  }

  /**
   * Get the current network status
   */
  async getNetworkStatus(): Promise<any> {
    return await this.algodClient.status().do();
  }

  /**
   * Wait for transaction confirmation with detailed status
   */
  async waitForTransactionConfirmation(
    txId: string, 
    maxRounds: number = 5
  ): Promise<any> {
    return await algosdk.waitForConfirmation(this.algodClient, txId, maxRounds);
  }
}

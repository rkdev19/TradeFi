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
}

import algosdk from 'algosdk';
import { MarketplaceClient, AuctionClient } from './client';
import * as utils from './utils';

export { MarketplaceClient, AuctionClient };
export { AuctionInfo, AssetInfo, AuctionCreateParams, BidParams, MarketplaceConfig } from './types';
export { utils };

/**
 * Creates a new marketplace client.
 * 
 * @param algodClient - The Algorand algod client for interacting with the blockchain.
 * @param indexerClient - The Algorand indexer client for querying blockchain data.
 * @param signer - The transaction signer responsible for signing transactions.
 * @returns A new instance of the MarketplaceClient.
 */
export function createMarketplaceClient(
  algodClient: algosdk.Algodv2,
  indexerClient: algosdk.Indexer,
  signer: algosdk.TransactionSigner
): MarketplaceClient {
  return new MarketplaceClient(algodClient, indexerClient, signer);
}

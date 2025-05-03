import algosdk from 'algosdk';
import { MarketplaceClient, AuctionClient } from './client';
import * as utils from './utils';

export { MarketplaceClient, AuctionClient };
export { AuctionInfo, AssetInfo, AuctionCreateParams, BidParams, MarketplaceConfig } from './types';
export { utils };

/**
 * Creates a new marketplace client
 */
export function createMarketplaceClient(
  algodClient: algosdk.Algodv2,
  indexerClient: algosdk.Indexer,
  signer: algosdk.TransactionSigner
): MarketplaceClient {
  return new MarketplaceClient(algodClient, indexerClient, signer);
}

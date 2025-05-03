import algosdk from 'algosdk';

export interface MarketplaceConfig {
  algodClient: algosdk.Algodv2;
  indexerClient: algosdk.Indexer;
  signer: algosdk.TransactionSigner;
}

export interface AuctionInfo {
  appId: number;
  assetId: number;
  floorPrice: number;
  highestBid: number;
  highestBidder: string;
  endTime: number;
  isActive: boolean;
  creator: string;
}

export interface AuctionCreateParams {
  creator: string;
  assetId: number;
  floorPrice: number;
  durationInSeconds: number;
}

export interface BidParams {
  appId: number;
  bidder: string;
  bidAmount: number;
}

export interface AssetInfo {
  id: number;
  name: string;
  url?: string;
  totalSupply: number;
  decimals: number;
  creator: string;
}

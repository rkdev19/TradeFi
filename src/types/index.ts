
export interface AuctionInfo {
  appId: number;
  assetId: number;
  floorPrice: number;
  highestBid: number;
  highestBidder: string;
  auctionEndTime: number;
  creator: string;
  totalEscrowedAmount: number;
  activeBiddersCount: number;
  isEscrowActive: boolean;
}

export interface BidderEscrowInfo {
  bidder: string;
  escrowedAmount: number;
  isHighestBidder: boolean;
}

export interface EscrowStatus {
  totalEscrowedAmount: number;
  activeBiddersCount: number;
  isEscrowActive: boolean;
}

export interface CreateAuctionParams {
  creator: string;
  assetId: number;
  floorPrice: number;
  durationInSeconds: number;
}

export interface PlaceBidParams {
  appId: number;
  bidder: string;
  bidAmount: number;
}

export interface WithdrawBidParams {
  appId: number;
  bidder: string;
}

// Enhanced MarketplaceClient interface
export interface AuctionClient {
  // Core methods
  createAuction(params: CreateAuctionParams): Promise<number>;
  placeBid(params: PlaceBidParams): Promise<void>;
  finalizeAuction(appId: number, sender: string): Promise<void>;
  acceptBid(appId: number, creator: string): Promise<void>;
  rejectBid(appId: number, creator: string): Promise<void>;
  getAuctionInfo(appId: number): Promise<AuctionInfo>;
  listActiveAuctions(): Promise<AuctionInfo[]>;
  
  // Escrow methods
  withdrawBid(params: WithdrawBidParams): Promise<void>;
  getBidderEscrow(appId: number, bidder: string): Promise<number>;
  getEscrowStatus(appId: number): Promise<EscrowStatus>;

  /**
   * NOTE: This function corresponds to a stub in the smart contract.
   * A robust, iterable refund mechanism is complex and not implemented.
   * This method should be treated as a placeholder for a potential future feature.
   */
  refundAllBidders(appId: number, creator: string): Promise<void>;
  
  // Utility methods
  canWithdrawBid(appId: number, bidder: string): Promise<boolean>;
}

// Error types for better error handling
export class AuctionError extends Error {
  constructor(
    message: string,
    public code: string,
    public appId?: number
  ) {
    super(message);
    this.name = 'AuctionError';
  }
}

export class EscrowError extends AuctionError {
  constructor(message: string, appId?: number) {
    super(message, 'ESCROW_ERROR', appId);
    this.name = 'EscrowError';
  }
}

// Constants for the enhanced contract
export const AUCTION_CONSTANTS = {
  ZERO_ADDRESS: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ",
  DEFAULT_FEE: 1000,
  SECONDS_PER_ROUND: 4.5,
  /**
   * NOTE: This is a client-side rule. The current contract only checks
   * if the new total bid is greater than the highest bid, not by how much.
   */
  MIN_BID_INCREMENT: 10000, // 0.01 Algos
} as const;

// Event types for tracking auction activities
export interface AuctionEvent {
  type: 'BID_PLACED' | 'BID_WITHDRAWN' | 'AUCTION_FINALIZED' | 'BID_ACCEPTED' | 'BID_REJECTED';
  appId: number;
  txId: string;
  timestamp: number;
  details: Record<string, any>;
}

export interface BidPlacedEvent extends AuctionEvent {
  type: 'BID_PLACED';
  details: {
    bidder: string;
    bidAmount: number;
    totalEscrowedAmount: number;
    isNewHighest: boolean;
  };
}

export interface BidWithdrawnEvent extends AuctionEvent {
  type: 'BID_WITHDRAWN';
  details: {
    bidder: string;
    withdrawnAmount: number;
    remainingEscrowedAmount: number;
  };
}

// Configuration for the enhanced auction system
export interface AuctionConfig {
  maxConcurrentBidders?: number;
  /**
   * NOTE: This is a client-side rule for placing bids.
   * The on-chain contract does not enforce a minimum increment.
   */
  minBidIncrement?: number;
  maxAuctionDuration?: number;
  escrowExpiryBlocks?: number;
}

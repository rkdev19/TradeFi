// =========================
// Core Auction Types
// =========================

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

// =========================
// Escrow Types
// =========================

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

// =========================
// Auction Client Interface
// =========================

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
   * Placeholder for a future robust refund mechanism.
   * Currently not implemented on-chain.
   */
  refundAllBidders(appId: number, creator: string): Promise<void>;

  // Utility methods
  canWithdrawBid(appId: number, bidder: string): Promise<boolean>;
}

// =========================
// Error Types
// =========================

export class AuctionError extends Error {
  constructor(
    message: string,
    public code: string,
    public appId?: number
  ) {
    super(message);
    this.name = "AuctionError";
  }
}

export class EscrowError extends AuctionError {
  constructor(message: string, appId?: number) {
    super(message, "ESCROW_ERROR", appId);
    this.name = "EscrowError";
  }
}

// =========================
// Constants
// =========================

export const AUCTION_CONSTANTS = {
  ZERO_ADDRESS: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ",
  DEFAULT_FEE: 1000,
  SECONDS_PER_ROUND: 4.5,

  /**
   * Client-side rule.
   * Contract only checks if new total > highest bid.
   */
  MIN_BID_INCREMENT: 10_000, // 0.01 Algos
} as const;

// =========================
// Events
// =========================

export type AuctionEventType =
  | "BID_PLACED"
  | "BID_WITHDRAWN"
  | "AUCTION_FINALIZED"
  | "BID_ACCEPTED"
  | "BID_REJECTED";

export interface AuctionEvent {
  type: AuctionEventType;
  appId: number;
  txId: string;
  timestamp: number;
  details: Record<string, any>;
}

export interface BidPlacedEvent extends AuctionEvent {
  type: "BID_PLACED";
  details: {
    bidder: string;
    bidAmount: number;
    totalEscrowedAmount: number;
    isNewHighest: boolean;
  };
}

export interface BidWithdrawnEvent extends AuctionEvent {
  type: "BID_WITHDRAWN";
  details: {
    bidder: string;
    withdrawnAmount: number;
    remainingEscrowedAmount: number;
  };
}

// =========================
// Config
// =========================

export interface AuctionConfig {
  maxConcurrentBidders?: number;

  /**
   * Client-side rule (not enforced on-chain).
   */
  minBidIncrement?: number;

  maxAuctionDuration?: number;
  escrowExpiryBlocks?: number;
}

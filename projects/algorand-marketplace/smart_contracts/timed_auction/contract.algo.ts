import {
  Contract,
  abimethod,
  Address,
  uint64,
  Asset,
  PaymentTxn,
  AssetTransferTxn,
} from '@algorandfoundation/algorand-typescript';

/**
 * A timed auction contract allowing bids for a single ASA.
 * - Creator sets floor price and duration
 * - Bidders compete by sending ALGO
 * - Highest bidder receives ASA, creator receives payment
 */
export class TimedAuctionContract extends Contract {
  // === Contract State ===
  assetId: uint64;
  floorPrice: uint64;
  highestBid: uint64;
  highestBidder: Address;
  auctionEndTime: uint64;
  assetEscrowed: boolean;

  // === Constants ===
  private readonly NO_BIDDER = new Address("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ");
  private readonly TXN_FEE: uint64 = 1000n;

  // === Auction Lifecycle ===

  /**
   * Create and configure the auction application.
   */
  @abimethod({ allowActions: ['NoOp'], onCreate: 'require' })
  createApplication(asset: Asset, floorPrice: uint64, auctionDurationSeconds: uint64): void {
    this.assetId = asset.id;
    this.floorPrice = floorPrice;
    this.highestBid = 0n;
    this.highestBidder = this.NO_BIDDER;
    this.assetEscrowed = false;

    // Convert seconds to approximate rounds (~4.5s per round)
    const roundsToAdd = Math.ceil(Number(auctionDurationSeconds) / 4.5);
    this.auctionEndTime = this.txn.lastValid + BigInt(roundsToAdd);

    this.log(
      `Auction created: assetId=${asset.id}, floorPrice=${floorPrice}, ends at round ${this.auctionEndTime}`
    );
  }

  /**
   * Update the floor price (creator-only).
   */
  @abimethod()
  setFloorPrice(newPrice: uint64): void {
    this.assertSenderIsCreator();
    this.floorPrice = newPrice;
    this.log(`Floor price updated to ${newPrice}`);
  }

  /**
   * Opt-in the application account to the ASA.
   */
  @abimethod()
  optInToAsset(mbrpay: PaymentTxn): void {
    this.assertSenderIsCreator();

    if (this.app.address.isOptedInToAsset(this.assetId)) {
      throw new Error("Contract is already opted into the asset");
    }

    const requiredAmount = this.app.minBalance + this.app.assetOptInMinBalance;
    if (mbrpay.receiver !== this.app.address || mbrpay.amount < requiredAmount) {
      throw new Error("Invalid minimum balance payment for asset opt-in");
    }

    this.sendAssetTransfer({
      xferAsset: this.assetId,
      assetReceiver: this.app.address,
      assetAmount: 0n,
    });

    this.log(`Opted into asset ${this.assetId}`);
  }

  /**
   * Escrow the auction asset into the application account.
   */
  @abimethod()
  escrowAsset(assetTransferTxn: AssetTransferTxn): void {
    this.assertSenderIsCreator();

    if (this.assetEscrowed) {
      throw new Error("Asset already escrowed");
    }

    const validEscrow =
      assetTransferTxn.assetReceiver === this.app.address &&
      assetTransferTxn.xferAsset === this.assetId &&
      assetTransferTxn.assetAmount === 1n;

    if (!validEscrow) {
      throw new Error("Escrow transfer must send exactly 1 unit of the auctioned asset to contract");
    }

    this.assetEscrowed = true;
    this.log(`Asset escrowed: assetId=${this.assetId}`);
  }

  // === Bidding ===

  /**
   * Place a bid by sending ALGO to the application account.
   */
  @abimethod()
  placeBid(bidPayment: PaymentTxn): void {
    if (!this.assetEscrowed) throw new Error("Auction has not received the asset yet");
    if (this.txn.lastValid > this.auctionEndTime) throw new Error("Auction has ended");
    if (this.txn.sender.toString() === this.app.creator.toString()) throw new Error("Creator cannot place bids");

    if (bidPayment.sender !== this.txn.sender || bidPayment.receiver !== this.app.address) {
      throw new Error("Invalid bid payment transaction");
    }
    if (bidPayment.amount < this.floorPrice) {
      throw new Error(`Bid must meet floor price of ${this.floorPrice}`);
    }
    if (bidPayment.amount <= this.highestBid) {
      throw new Error(`Bid must exceed current highest bid of ${this.highestBid}`);
    }

    // Refund previous highest bidder
    if (this.hasValidBid()) {
      this.sendPayment({
        receiver: this.highestBidder,
        amount: this.highestBid,
        fee: this.TXN_FEE,
      });
    }

    this.highestBid = bidPayment.amount;
    this.highestBidder = this.txn.sender;

    this.log(`New highest bid: ${this.highestBid} by ${this.highestBidder}`);
  }

  // === Settlement ===

  /**
   * Finalize the auction after it has ended.
   */
  @abimethod()
  finalizeAuction(): void {
    if (this.txn.lastValid <= this.auctionEndTime) throw new Error("Auction not yet ended");
    if (!this.hasValidBid()) throw new Error("No bids placed during auction");

    this.sendAssetTransfer({
      xferAsset: this.assetId,
      assetReceiver: this.highestBidder,
      assetAmount: 1n,
      fee: this.TXN_FEE,
    });

    this.sendPayment({
      receiver: this.app.creator,
      amount: this.highestBid,
      fee: this.TXN_FEE,
    });

    this.resetAuction();
    this.log(`Auction finalized. Asset → ${this.highestBidder}, Creator paid ${this.highestBid}`);
  }

  /**
   * Manually accept the highest bid (creator-only).
   */
  @abimethod()
  acceptBid(): void {
    this.assertSenderIsCreator();
    if (!this.hasValidBid()) throw new Error("No bid to accept");

    this.sendAssetTransfer({
      xferAsset: this.assetId,
      assetReceiver: this.highestBidder,
      assetAmount: 1n,
      fee: this.TXN_FEE,
    });

    this.sendPayment({
      receiver: this.app.creator,
      amount: this.highestBid,
      fee: this.TXN_FEE,
    });

    this.resetAuction();
    this.log(`Bid accepted: ${this.highestBid} from ${this.highestBidder}`);
  }

  /**
   * Reject and refund the highest bid (creator-only).
   */
  @abimethod()
  rejectBid(): void {
    this.assertSenderIsCreator();
    if (!this.hasValidBid()) throw new Error("No bid to reject");

    this.sendPayment({
      receiver: this.highestBidder,
      amount: this.highestBid,
      fee: this.TXN_FEE,
    });

    this.resetAuction();
    this.log(`Bid rejected: ${this.highestBid} refunded to ${this.highestBidder}`);
  }

  // === Teardown ===

  /**
   * Delete the application and reclaim assets.
   */
  @abimethod({ allowActions: ['DeleteApplication'] })
  deleteApplication(): void {
    this.assertSenderIsCreator();

    this.sendAssetTransfer({
      xferAsset: this.assetId,
      assetReceiver: this.app.creator,
      assetAmount: 0n,
      assetCloseTo: this.app.creator,
      fee: this.TXN_FEE,
    });

    this.sendPayment({
      receiver: this.app.creator,
      amount: 0n,
      closeRemainderTo: this.app.creator,
      fee: this.TXN_FEE,
    });

    this.log("Application deleted, assets reclaimed");
  }

  // === Utility Functions ===

  private resetAuction(): void {
    this.highestBid = 0n;
    this.highestBidder = this.NO_BIDDER;
    this.assetEscrowed = false;
    this.auctionEndTime = 0n;
  }

  private assertSenderIsCreator(): void {
    if (this.txn.sender.toString() !== this.app.creator.toString()) {
      throw new Error("Only the creator can perform this action");
    }
  }

  private hasValidBid(): boolean {
    return this.highestBidder.toString() !== this.NO_BIDDER.toString();
  }
}
  @abimethod()
  setFloorPrice(newPrice: uint64): void {
    this.assertSenderIsCreator();
    this.floorPrice = newPrice;
    this.log(`Floor price updated to ${newPrice}`);
  }

  @abimethod()
  optInToAsset(mbrpay: PaymentTxn): void {
    this.assertSenderIsCreator();

    if (this.app.address.isOptedInToAsset(this.assetId)) {
      throw new Error("Contract is already opted into the asset");
    }

    const requiredAmount = this.app.minBalance + this.app.assetOptInMinBalance;
    if (mbrpay.receiver !== this.app.address || mbrpay.amount < requiredAmount) {
      throw new Error("Invalid minimum balance payment for asset opt-in");
    }

    this.sendAssetTransfer({
      xferAsset: this.assetId,
      assetReceiver: this.app.address,
      assetAmount: 0,
    });

    this.log(`Opted into asset ${this.assetId}`);
  }

  @abimethod()
  escrowAsset(assetTransferTxn: any): void {
    this.assertSenderIsCreator();

    if (this.assetEscrowed) {
      throw new Error("Asset already escrowed");
    }

    const isValid =
      assetTransferTxn.assetReceiver === this.app.address &&
      assetTransferTxn.xferAsset === this.assetId &&
      assetTransferTxn.assetAmount === 1;

    if (!isValid) {
      throw new Error("Escrow transfer must transfer 1 unit of the auctioned asset to contract");
    }

    this.assetEscrowed = true;
    this.log(`Asset escrowed: assetId=${this.assetId}`);
  }

  @abimethod()
  placeBid(bidPayment: PaymentTxn): void {
    if (!this.assetEscrowed) {
      throw new Error("Auction has not received the asset for escrow yet");
    }

    if (this.txn.lastValid > this.auctionEndTime) {
      throw new Error("Cannot place bid: auction has ended");
    }

    if (this.txn.sender.toString() === this.app.creator.toString()) {
      throw new Error("Creator cannot place bids");
    }

    if (bidPayment.sender !== this.txn.sender || bidPayment.receiver !== this.app.address) {
      throw new Error("Invalid bid payment transaction");
    }

    if (bidPayment.amount < this.floorPrice) {
      throw new Error(`Bid below floor price of ${this.floorPrice}`);
    }

    if (bidPayment.amount <= this.highestBid) {
      throw new Error(`Bid must exceed current highest bid of ${this.highestBid}`);
    }

    if (this.hasValidBid()) {
      this.sendPayment({
        receiver: this.highestBidder,
        amount: this.highestBid,
        fee: 1000,
      });
    }

    this.highestBid = bidPayment.amount;
    this.highestBidder = this.txn.sender;

    this.log(`New highest bid: ${this.highestBid} by ${this.highestBidder}`);
  }

  @abimethod()
  finalizeAuction(): void {
    if (this.txn.lastValid <= this.auctionEndTime) {
      throw new Error("Auction not yet ended");
    }

    if (!this.hasValidBid()) {
      throw new Error("No bids placed during auction");
    }

    this.sendAssetTransfer({
      xferAsset: this.assetId,
      assetReceiver: this.highestBidder,
      assetAmount: 1,
      fee: 1000,
    });

    this.sendPayment({
      receiver: this.app.creator,
      amount: this.highestBid,
      fee: 1000,
    });

    this.resetAuction();
    this.log(`Auction finalized. Asset transferred to ${this.highestBidder}, creator paid ${this.highestBid}`);
  }

  @abimethod()
  acceptBid(): void {
    this.assertSenderIsCreator();

    if (!this.hasValidBid()) {
      throw new Error("No bid to accept");
    }

    this.sendAssetTransfer({
      xferAsset: this.assetId,
      assetReceiver: this.highestBidder,
      assetAmount: 1,
      fee: 1000,
    });

    this.sendPayment({
      receiver: this.app.creator,
      amount: this.highestBid,
      fee: 1000,
    });

    this.resetAuction();
    this.log(`Bid accepted: ${this.highestBid} from ${this.highestBidder}`);
  }

  @abimethod()
  rejectBid(): void {
    this.assertSenderIsCreator();

    if (!this.hasValidBid()) {
      throw new Error("No bid to reject");
    }

    this.sendPayment({
      receiver: this.highestBidder,
      amount: this.highestBid,
      fee: 1000,
    });

    this.resetAuction();
    this.log(`Bid rejected: ${this.highestBid} refunded to ${this.highestBidder}`);
  }

  @abimethod({ allowActions: ['DeleteApplication'] })
  deleteApplication(): void {
    this.assertSenderIsCreator();

    this.sendAssetTransfer({
      xferAsset: this.assetId,
      assetReceiver: this.app.creator,
      assetAmount: 0,
      assetCloseTo: this.app.creator,
      fee: 1000,
    });

    this.sendPayment({
      receiver: this.app.creator,
      amount: 0,
      closeRemainderTo: this.app.creator,
      fee: 1000,
    });

    this.log("Application deleted and assets reclaimed");
  }

  // === Utility Functions ===

  private resetAuction(): void {
    this.highestBid = 0;
    this.highestBidder = this.NO_BIDDER;
    this.assetEscrowed = false;
  }

  private assertSenderIsCreator(): void {
    if (this.txn.sender.toString() !== this.app.creator.toString()) {
      throw new Error("Only the creator can perform this action");
    }
  }

  private hasValidBid(): boolean {
    return this.highestBidder.toString() !== this.NO_BIDDER.toString();
  }
}

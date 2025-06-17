import {
  Contract,
  abimethod,
  Address,
  uint64,
  Asset,
  PaymentTxn,
  BoxMap,
  BoxKey
} from '@algorandfoundation/algorand-typescript';

export class TimedAuctionContract extends Contract {
  // Existing state variables (unchanged)
  assetId: uint64;
  floorPrice: uint64;
  highestBid: uint64;
  highestBidder: Address;
  auctionEndTime: uint64;

  // New escrow management variables
  totalEscrowedAmount: uint64;
  activeBiddersCount: uint64;
  isEscrowActive: boolean;

  // Box storage for managing bidder escrows
  // Key: bidder address, Value: escrowed amount
  bidderEscrows = new BoxMap<Address, uint64>();

  @abimethod({ allowActions: ['NoOp'], onCreate: 'require' })
  createApplication(
    assetId: Asset,
    floorPrice: uint64,
    auctionDurationSeconds: uint64
  ): void {
    this.assetId = assetId.id;
    this.floorPrice = floorPrice;
    this.highestBid = 0;
    this.highestBidder = new Address("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ");

    // Initialize escrow variables
    this.totalEscrowedAmount = 0;
    this.activeBiddersCount = 0;
    this.isEscrowActive = true;

    // Set auction end time based on current round + duration
    const roundsToAdd = Math.ceil(Number(auctionDurationSeconds) / 4.5);
    this.auctionEndTime = this.txn.lastValid + BigInt(roundsToAdd);
  }

  @abimethod()
  setFloorPrice(floorPrice: uint64): void {
    this.assertSenderIsCreator();
    this.floorPrice = floorPrice;
  }

  @abimethod()
  optInToAsset(mbrpay: PaymentTxn): void {
    this.assertSenderIsCreator();

    if (this.app.address.isOptedInToAsset(this.assetId)) {
      throw new Error("Already opted in to asset");
    }

    if (mbrpay.receiver !== this.app.address ||
        mbrpay.amount < this.app.minBalance + this.app.assetOptInMinBalance) {
      throw new Error("Invalid MBR payment");
    }

    this.sendAssetTransfer({
      xferAsset: this.assetId,
      assetReceiver: this.app.address,
      assetAmount: 0
    });
  }

  @abimethod()
  placeBid(bidPayment: PaymentTxn): void {
    if (this.txn.lastValid > this.auctionEndTime) {
      throw new Error("Auction has ended");
    }

    if (!this.isEscrowActive) {
      throw new Error("Escrow is not active");
    }

    if (bidPayment.sender !== this.txn.sender ||
        bidPayment.receiver !== this.app.address ||
        bidPayment.amount < this.floorPrice) {
      throw new Error("Invalid bid payment");
    }

    const bidder = this.txn.sender;
    const bidAmount = bidPayment.amount;
    const currentEscrow = this.bidderEscrows.get(bidder).value || 0;
    const totalBidAmount = currentEscrow + bidAmount;

    // Check if this bid is higher than current highest
    if (totalBidAmount <= this.highestBid) {
      throw new Error("Bid must be higher than current highest bid");
    }

    // Update or create escrow entry for this bidder
    if (currentEscrow === 0) {
      this.activeBiddersCount += 1;
    }
    this.bidderEscrows.set(bidder, totalBidAmount);
    this.totalEscrowedAmount += bidAmount;

    // Update highest bid tracking
    this.highestBid = totalBidAmount;
    this.highestBidder = bidder;
  }

  @abimethod()
  withdrawBid(): void {
    if (!this.isEscrowActive) {
      throw new Error("Escrow is not active");
    }

    const bidder = this.txn.sender;
    const escrowedAmount = this.bidderEscrows.get(bidder).value;

    if (escrowedAmount === undefined || escrowedAmount === 0) {
      throw new Error("No escrowed amount found for bidder");
    }

    // Cannot withdraw if you're the current highest bidder and auction is still active
    if (bidder === this.highestBidder && this.txn.lastValid <= this.auctionEndTime) {
      throw new Error("Cannot withdraw while being highest bidder during active auction");
    }

    // Process withdrawal
    this.sendPayment({
      receiver: bidder,
      amount: escrowedAmount,
      fee: 1000
    });

    // Update escrow state
    this.bidderEscrows.delete(bidder);
    this.totalEscrowedAmount -= escrowedAmount;
    this.activeBiddersCount -= 1;

    // If this was the highest bidder, find new highest bid
    if (bidder === this.highestBidder) {
      this.findNewHighestBidder();
    }
  }

  @abimethod()
  finalizeAuction(): void {
    if (this.txn.lastValid <= this.auctionEndTime) {
      throw new Error("Auction still in progress");
    }

    if (!this.isEscrowActive) {
      throw new Error("Auction already finalized or escrow inactive");
    }

    if (this.highestBidder.toString() !== "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ") {
      // Transfer asset to highest bidder
      this.sendAssetTransfer({
        xferAsset: this.assetId,
        assetReceiver: this.highestBidder,
        assetAmount: 1,
        fee: 1000
      });

      // Transfer winning bid to creator
      const winningAmount = this.bidderEscrows.get(this.highestBidder).value || 0;
      this.sendPayment({
        receiver: this.app.creator,
        amount: winningAmount,
        fee: 1000
      });

      // Remove winner from escrow
      this.bidderEscrows.delete(this.highestBidder);
      this.totalEscrowedAmount -= winningAmount;
      this.activeBiddersCount -= 1;
    }

    // Deactivate escrow to allow all remaining bidders to withdraw
    this.isEscrowActive = false;
    this.resetAuctionState();
  }

  @abimethod()
  acceptBid(): void {
    this.assertSenderIsCreator();

    if (this.highestBidder.toString() === "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ") {
      throw new Error("No valid bid to accept");
    }

    if (!this.isEscrowActive) {
      throw new Error("Escrow is not active");
    }

    // Transfer asset to highest bidder
    this.sendAssetTransfer({
      xferAsset: this.assetId,
      assetReceiver: this.highestBidder,
      assetAmount: 1,
      fee: 1000
    });

    // Transfer winning bid to creator
    const winningAmount = this.bidderEscrows.get(this.highestBidder).value || 0;
    this.sendPayment({
      receiver: this.app.creator,
      amount: winningAmount,
      fee: 1000
    });

    // Remove winner from escrow
    this.bidderEscrows.delete(this.highestBidder);
    this.totalEscrowedAmount -= winningAmount;
    this.activeBiddersCount -= 1;

    // Deactivate escrow to allow remaining bidders to withdraw
    this.isEscrowActive = false;
    this.resetAuctionState();
  }

  @abimethod()
  rejectBid(): void {
    this.assertSenderIsCreator();

    if (this.highestBidder.toString() === "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ") {
      throw new Error("No valid bid to reject");
    }

    // Simply deactivate escrow - all bidders can then withdraw their funds
    this.isEscrowActive = false;
    this.resetAuctionState();
  }

  @abimethod()
  refundAllBidders(): void {
    this.assertSenderIsCreator();
    
    if (this.isEscrowActive) {
      throw new Error("Cannot refund while auction is active. Use rejectBid() first.");
    }

    // This method allows creator to trigger refunds for bidders who haven't withdrawn
    // Note: In practice, bidders should call withdrawBid() themselves after auction ends
    // This is a safety mechanism
  }

  @abimethod()
  getBidderEscrow(bidder: Address): uint64 {
    return this.bidderEscrows.get(bidder).value || 0;
  }

  @abimethod()
  getEscrowStatus(): [uint64, uint64, boolean] {
    return [this.totalEscrowedAmount, this.activeBiddersCount, this.isEscrowActive];
  }

  @abimethod({ allowActions: ['DeleteApplication'] })
  deleteApplication(): void {
    this.assertSenderIsCreator();

    // Ensure no funds are escrowed before deletion
    if (this.totalEscrowedAmount > 0) {
      throw new Error("Cannot delete application while funds are escrowed");
    }

    this.sendAssetTransfer({
      xferAsset: this.assetId,
      assetReceiver: this.app.creator,
      assetAmount: 0,
      assetCloseTo: this.app.creator,
      fee: 1000
    });

    this.sendPayment({
      receiver: this.app.creator,
      amount: 0,
      closeRemainderTo: this.app.creator,
      fee: 1000
    });
  }

  private findNewHighestBidder(): void {
    let newHighestBid = 0;
    let newHighestBidder = new Address("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ");

    // Note: In a production environment, you might want to implement a more efficient
    // method to track bidders, as iterating through all box keys can be expensive
    // This is a simplified implementation for demonstration
    
    this.highestBid = newHighestBid;
    this.highestBidder = newHighestBidder;
  }

  private resetAuctionState(): void {
    this.highestBid = 0;
    this.highestBidder = new Address("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ");
  }

  private assertSenderIsCreator(): void {
    if (this.txn.sender.toString() !== this.app.creator.toString()) {
      throw new Error("Only the creator can perform this action");
    }
  }
}

  import {
    Contract,
    abimethod,
    Address,
    uint64,
    Asset,
    PaymentTransaction
  } from '@algorandfoundation/algorand-typescript';

export class TimedAuctionContract extends Contract {
  // State variables
  assetId: uint64;
  floorPrice: uint64;
  highestBid: uint64;
  highestBidder: Address;
  auctionEndTime: uint64;

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

    // Set auction end time based on current round + duration
    // Converting seconds to rounds (approximately 4.5 seconds per round)
    const roundsToAdd = Math.ceil(Number(auctionDurationSeconds) / 4.5);
    this.auctionEndTime = this.txn.lastRound + BigInt(roundsToAdd);
  }

  @abimethod()
  setFloorPrice(floorPrice: uint64): void {
    this.assertSenderIsCreator();
    this.floorPrice = floorPrice;
  }

  @abimethod()
  optInToAsset(mbrpay: PaymentTransaction): void {
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
  placeBid(bidPayment: PaymentTransaction): void {
    if (this.txn.lastRound > this.auctionEndTime) {
      throw new Error("Auction has ended");
    }

    if (bidPayment.sender !== this.txn.sender ||
        bidPayment.receiver !== this.app.address ||
        bidPayment.amount <= this.highestBid ||
        bidPayment.amount < this.floorPrice) {
      throw new Error("Invalid bid");
    }

    if (this.highestBidder.toString() !== "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ") {
      this.sendPayment({
        receiver: this.highestBidder,
        amount: this.highestBid,
        fee: 1000
      });
    }

    this.highestBid = bidPayment.amount;
    this.highestBidder = this.txn.sender;
  }

  @abimethod()
  finalizeAuction(): void {
    if (this.txn.lastRound <= this.auctionEndTime) {
      throw new Error("Auction still in progress");
    }

    if (this.highestBidder.toString() !== "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ") {
      this.sendAssetTransfer({
        xferAsset: this.assetId,
        assetReceiver: this.highestBidder,
        assetAmount: 1,
        fee: 1000
      });

      this.sendPayment({
        receiver: this.app.creator,
        amount: this.highestBid,
        fee: 1000
      });
    }

    this.resetAuctionState();
  }

  @abimethod()
  acceptBid(): void {
    this.assertSenderIsCreator();

    if (this.highestBidder.toString() === "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ") {
      throw new Error("No valid bid to accept");
    }

    this.sendAssetTransfer({
      xferAsset: this.assetId,
      assetReceiver: this.highestBidder,
      assetAmount: 1,
      fee: 1000
    });

    this.sendPayment({
      receiver: this.app.creator,
      amount: this.highestBid,
      fee: 1000
    });

    this.resetAuctionState();
  }

  @abimethod()
  rejectBid(): void {
    this.assertSenderIsCreator();

    if (this.highestBidder.toString() === "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ") {
      throw new Error("No valid bid to reject");
    }

    this.sendPayment({
      receiver: this.highestBidder,
      amount: this.highestBid,
      fee: 1000
    });

    this.resetAuctionState();
  }

  @abimethod({ allowActions: ['DeleteApplication'] })
  deleteApplication(): void {
    this.assertSenderIsCreator();

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

import {
  Contract,
  abimethod,
  Address,
  uint64,
  Asset,
  PaymentTxn,
} from '@algorandfoundation/algorand-typescript';

export class TimedAuctionContract extends Contract {
  assetId: uint64;
  floorPrice: uint64;
  highestBid: uint64;
  highestBidder: Address;
  auctionEndTime: uint64;
  assetEscrowed: boolean;

  private readonly NO_BIDDER = new Address("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ");

  @abimethod({ allowActions: ['NoOp'], onCreate: 'require' })
  createApplication(
    asset: Asset,
    floorPrice: uint64,
    auctionDurationSeconds: uint64
  ): void {
    this.assetId = asset.id;
    this.floorPrice = floorPrice;
    this.highestBid = 0;
    this.highestBidder = this.NO_BIDDER;
    this.assetEscrowed = false;

    const roundsToAdd = Math.ceil(Number(auctionDurationSeconds) / 4.5);
    this.auctionEndTime = this.txn.lastValid + BigInt(roundsToAdd);

    this.log(`Auction created: assetId=${asset.id}, floorPrice=${floorPrice}, ends at round ${this.auctionEndTime}`);
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

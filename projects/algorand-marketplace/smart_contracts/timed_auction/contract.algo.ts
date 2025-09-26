import {
  Contract,
  abimethod,
  Address,
  uint64,
  Asset,
  PaymentTxn,
  AssetTransferTxn,
} from '@algorandfoundation/algorand-typescript';

export class TimedAuctionContract extends Contract {
  assetId: uint64;
  floorPrice: uint64;
  highestBid: uint64;
  highestBidder: Address;
  auctionEndTime: uint64;
  assetEscrowed: boolean;

  private readonly NO_BIDDER = new Address(
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ"
  );
  private readonly TXN_FEE: uint64 = 1000n;

  @abimethod({ allowActions: ['NoOp'], onCreate: 'require' })
  createApplication(asset: Asset, floorPrice: uint64, auctionDurationSeconds: uint64): void {
    this.assetId = asset.id;
    this.floorPrice = floorPrice;
    this.highestBid = 0n;
    this.highestBidder = this.NO_BIDDER;
    this.assetEscrowed = false;

    const seconds = Number(auctionDurationSeconds);
    const roundsToAdd = BigInt(Math.ceil(seconds / 4.5));
    this.auctionEndTime = this.txn.lastValid + roundsToAdd;

    this.log(`Auction created: assetId=${asset.id}, floorPrice=${floorPrice}, ends at ${this.auctionEndTime}`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  setFloorPrice(newPrice: uint64): void {
    this.assertSenderIsCreator();
    this.floorPrice = newPrice;
    this.log(`Floor price updated to ${newPrice}`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  optInToAsset(payment: PaymentTxn): void {
    this.assertSenderIsCreator();
    if (this.app.address.isOptedInToAsset(this.assetId)) {
      throw new Error("Already opted in to asset");
    }
    const requiredMin = this.app.minBalance + this.app.assetOptInMinBalance;
    if (payment.receiver !== this.app.address || payment.amount < requiredMin) {
      throw new Error("Invalid payment for opt-in");
    }
    this.sendAssetTransfer({
      xferAsset: this.assetId,
      assetReceiver: this.app.address,
      assetAmount: 0n,
    });
    this.log(`Opted into asset ${this.assetId}`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  escrowAsset(txn: AssetTransferTxn): void {
    this.assertSenderIsCreator();
    if (this.assetEscrowed) {
      throw new Error("Asset already escrowed");
    }
    const valid =
      txn.assetReceiver === this.app.address &&
      txn.xferAsset === this.assetId &&
      txn.assetAmount === 1n;
    if (!valid) {
      throw new Error("Must send exactly one unit of asset to escrow");
    }
    this.assetEscrowed = true;
    this.log(`Asset escrowed: ${this.assetId}`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  placeBid(bidPayment: PaymentTxn): void {
    if (!this.assetEscrowed) {
      throw new Error("Asset not escrowed");
    }
    if (this.txn.lastValid > this.auctionEndTime) {
      throw new Error("Auction ended");
    }
    if (this.txn.sender.toString() === this.app.creator.toString()) {
      throw new Error("Creator cannot bid");
    }
    if (bidPayment.sender !== this.txn.sender || bidPayment.receiver !== this.app.address) {
      throw new Error("Invalid bid payment");
    }
    if (bidPayment.amount < this.floorPrice) {
      throw new Error(`Bid below floor price ${this.floorPrice}`);
    }
    if (bidPayment.amount <= this.highestBid) {
      throw new Error(`Bid must exceed current highest ${this.highestBid}`);
    }
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

  @abimethod({ allowActions: ['NoOp'] })
  finalizeAuction(): void {
    if (this.txn.lastValid <= this.auctionEndTime) {
      throw new Error("Auction not yet ended");
    }
    if (!this.hasValidBid()) {
      throw new Error("No bids");
    }
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
    this.log(`Auction finalized: asset → ${this.highestBidder}, creator paid ${this.highestBid}`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  acceptBid(): void {
    this.assertSenderIsCreator();
    if (!this.hasValidBid()) {
      throw new Error("No bid to accept");
    }
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

  @abimethod({ allowActions: ['NoOp'] })
  rejectBid(): void {
    this.assertSenderIsCreator();
    if (!this.hasValidBid()) {
      throw new Error("No bid to reject");
    }
    this.sendPayment({
      receiver: this.highestBidder,
      amount: this.highestBid,
      fee: this.TXN_FEE,
    });
    this.resetAuction();
    this.log(`Bid rejected: ${this.highestBid} refunded`);
  }

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
    this.log("Contract deleted, assets reclaimed");
  }

  private resetAuction(): void {
    this.highestBid = 0n;
    this.highestBidder = this.NO_BIDDER;
    this.assetEscrowed = false;
    this.auctionEndTime = 0n;
  }

  private assertSenderIsCreator(): void {
    if (this.txn.sender.toString() !== this.app.creator.toString()) {
      throw new Error("Only creator allowed");
    }
  }

  private hasValidBid(): boolean {
    return this.highestBidder.toString() !== this.NO_BIDDER.toString();
  }
}

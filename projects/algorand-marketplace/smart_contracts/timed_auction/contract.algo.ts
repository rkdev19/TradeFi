import {
  Contract,
  abimethod,
  Address,
  uint64,
  Asset,
  PaymentTxn
} from '@algorandfoundation/algorand-typescript';

export class TimedAuctionContract extends Contract {
  // State variables
  assetId: uint64;
  floorPrice: uint64;
  highestBid: uint64;
  highestBidder: Address;
  auctionEndTime: uint64;
  assetEscrowed: boolean;

  // Placeholder for "no bidder"
  private readonly NO_BIDDER = new Address("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ");

  @abimethod({ allowActions: ['NoOp'], onCreate: 'require' })
  createApplication(
    assetId: Asset,
    floorPrice: uint64,
    auctionDurationSeconds: uint64
  ): void {
    this.assetId = assetId.id;
    this.floorPrice = floorPrice;
    this.highestBid = 0;
    this.highestBidder = this.NO_BIDDER;
    this.assetEscrowed = false;

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

    if (
      mbrpay.receiver !== this.app.address ||
      mbrpay.amount < this.app.minBalance + this.app.assetOptInMinBalance
    ) {
      throw new Error("Invalid MBR payment");
    }

    this.sendAssetTransfer({
      xferAsset: this.assetId,
      assetReceiver: this.app.address,
      assetAmount: 0
    });
  }

  @abimethod()
  escrowAsset(assetTransferTxn: any): void {
    this.assertSenderIsCreator();

    if (this.assetEscrowed) {
      throw new Error("Asset already escrowed");
    }

    if (
      assetTransferTxn.assetReceiver !== this.app.address ||
      assetTransferTxn.xferAsset !== this.assetId ||
      assetTransferTxn.assetAmount !== 1
    ) {
      throw new Error("Invalid escrow transfer");
    }

    this.assetEscrowed = true;
  }

  @abimethod()
  placeBid(bidPayment: PaymentTxn): void {
    if (!this.assetEscrowed) {
      throw new Error("Asset not yet escrowed");
    }

    if (this.txn.lastValid > this.auctionEndTime) {
      throw new Error("Auction has ended");
    }

    if (
      bidPayment.sender !== this.txn.sender ||
      bidPayment.receiver !== this.app.address ||
      bidPayment.amount <= this.highestBid ||
      bidPayment.amount < this.floorPrice
    ) {
      throw new Error("Invalid bid");
    }

    if (this.highestBidder.toString() !== this.NO_BIDDER.toString()) {
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
    if (this.txn.lastValid <= this.auctionEndTime) {
      throw new Error("Auction still in progress");
    }

    if (this.highestBidder.toString() === this.NO_BIDDER.toString()) {
      throw new Error("No valid bids to finalize");
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
  acceptBid(): void {
    this.assertSenderIsCreator();

    if (this.highestBidder.toString() === this.NO_BIDDER.toString()) {
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

    if (this.highestBidder.toString() === this.NO_BIDDER.toString()) {
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
    this.highestBidder = this.NO_BIDDER;
    this.assetEscrowed = false;
  }

  private assertSenderIsCreator(): void {
    if (this.txn.sender.toString() !== this.app.creator.toString()) {
      throw new Error("Only the creator can perform this action");
    }
  }
}

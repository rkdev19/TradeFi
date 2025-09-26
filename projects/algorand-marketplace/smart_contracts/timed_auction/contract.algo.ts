import {
  Contract,
  abimethod,
  Address,
  uint64,
  Asset,
  PaymentTxn,
  AssetTransferTxn,
  GlobalStateKey,
  GlobalStateValue,
} from '@algorandfoundation/algorand-typescript';

export class TimedAuctionContract extends Contract {
  // State variables
  assetId = GlobalStateKey<uint64>({ key: 'asset_id' });
  floorPrice = GlobalStateKey<uint64>({ key: 'floor_price' });
  highestBid = GlobalStateKey<uint64>({ key: 'highest_bid' });
  highestBidder = GlobalStateKey<Address>({ key: 'highest_bidder' });
  auctionEndTime = GlobalStateKey<uint64>({ key: 'auction_end' });
  assetEscrowed = GlobalStateKey<boolean>({ key: 'asset_escrowed' });
  auctionActive = GlobalStateKey<boolean>({ key: 'auction_active' });

  // Constants
  private readonly NO_BIDDER = Address.zeroAddress;
  private readonly MIN_TXN_FEE: uint64 = 1000n;
  private readonly MIN_AUCTION_DURATION: uint64 = 300n; // 5 minutes minimum
  private readonly MAX_AUCTION_DURATION: uint64 = 2592000n; // 30 days maximum

  @abimethod({ allowActions: ['NoOp'], onCreate: 'require' })
  createApplication(
    asset: Asset, 
    floorPrice: uint64, 
    auctionDurationSeconds: uint64
  ): void {
    // Validate inputs
    if (floorPrice === 0n) {
      throw new Error('Floor price must be greater than 0');
    }
    
    if (auctionDurationSeconds < this.MIN_AUCTION_DURATION) {
      throw new Error(`Auction duration must be at least ${this.MIN_AUCTION_DURATION} seconds`);
    }
    
    if (auctionDurationSeconds > this.MAX_AUCTION_DURATION) {
      throw new Error(`Auction duration cannot exceed ${this.MAX_AUCTION_DURATION} seconds`);
    }

    // Initialize state
    this.assetId.value = asset.id;
    this.floorPrice.value = floorPrice;
    this.highestBid.value = 0n;
    this.highestBidder.value = this.NO_BIDDER;
    this.assetEscrowed.value = false;
    this.auctionActive.value = false;

    // Calculate end time (assuming 4.5 second block time)
    const roundsToAdd = BigInt(Math.ceil(Number(auctionDurationSeconds) / 4.5));
    this.auctionEndTime.value = this.txn.lastValid + roundsToAdd;

    this.log(`Auction created: assetId=${asset.id}, floorPrice=${floorPrice}, duration=${auctionDurationSeconds}s`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  updateFloorPrice(newPrice: uint64): void {
    this.assertSenderIsCreator();
    this.assertAuctionNotStarted();
    
    if (newPrice === 0n) {
      throw new Error('Floor price must be greater than 0');
    }
    
    this.floorPrice.value = newPrice;
    this.log(`Floor price updated to ${newPrice}`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  optInToAsset(mbr_payment: PaymentTxn): void {
    this.assertSenderIsCreator();
    
    if (this.app.address.isOptedInToAsset(this.assetId.value)) {
      throw new Error('Contract already opted into asset');
    }

    // Verify MBR payment
    const requiredMBR = this.app.minBalance + this.app.assetOptInMinBalance;
    if (mbr_payment.receiver !== this.app.address || mbr_payment.amount < requiredMBR) {
      throw new Error(`Invalid MBR payment. Required: ${requiredMBR}`);
    }

    // Opt into the asset
    this.sendAssetTransfer({
      xferAsset: this.assetId.value,
      assetReceiver: this.app.address,
      assetAmount: 0n,
    });

    this.log(`Opted into asset ${this.assetId.value}`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  escrowAsset(asset_txn: AssetTransferTxn): void {
    this.assertSenderIsCreator();
    
    if (this.assetEscrowed.value) {
      throw new Error('Asset already escrowed');
    }

    // Validate asset transfer
    if (asset_txn.assetReceiver !== this.app.address ||
        asset_txn.xferAsset !== this.assetId.value ||
        asset_txn.assetAmount !== 1n) {
      throw new Error('Must transfer exactly 1 unit of the auction asset');
    }

    this.assetEscrowed.value = true;
    this.auctionActive.value = true;
    
    this.log(`Asset ${this.assetId.value} escrowed and auction activated`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  placeBid(bid_payment: PaymentTxn): void {
    this.assertAuctionActive();
    this.assertAuctionNotEnded();
    
    // Prevent creator from bidding
    if (this.txn.sender === this.app.creator) {
      throw new Error('Contract creator cannot place bids');
    }

    // Validate bid payment
    if (bid_payment.sender !== this.txn.sender || 
        bid_payment.receiver !== this.app.address) {
      throw new Error('Invalid bid payment transaction');
    }

    // Check minimum bid requirements
    if (bid_payment.amount < this.floorPrice.value) {
      throw new Error(`Bid must meet floor price of ${this.floorPrice.value}`);
    }

    if (bid_payment.amount <= this.highestBid.value) {
      throw new Error(`Bid must exceed current highest bid of ${this.highestBid.value}`);
    }

    // Refund previous highest bidder if exists
    if (this.hasValidBid()) {
      this.sendPayment({
        receiver: this.highestBidder.value,
        amount: this.highestBid.value,
        fee: this.MIN_TXN_FEE,
      });
      this.log(`Refunded previous bidder ${this.highestBidder.value}: ${this.highestBid.value}`);
    }

    // Update auction state
    this.highestBid.value = bid_payment.amount;
    this.highestBidder.value = this.txn.sender;

    this.log(`New highest bid: ${bid_payment.amount} by ${this.txn.sender}`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  finalizeAuction(): void {
    this.assertAuctionActive();
    
    if (this.txn.lastValid <= this.auctionEndTime.value) {
      throw new Error('Auction has not yet ended');
    }

    if (!this.hasValidBid()) {
      throw new Error('No valid bids to finalize');
    }

    this.executeAuctionSettlement();
    this.log(`Auction finalized: Winner ${this.highestBidder.value}, Amount ${this.highestBid.value}`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  acceptBid(): void {
    this.assertSenderIsCreator();
    this.assertAuctionActive();
    
    if (!this.hasValidBid()) {
      throw new Error('No bid available to accept');
    }

    this.executeAuctionSettlement();
    this.log(`Bid accepted early: ${this.highestBid.value} from ${this.highestBidder.value}`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  cancelAuction(): void {
    this.assertSenderIsCreator();
    this.assertAuctionActive();

    // Refund highest bidder if exists
    if (this.hasValidBid()) {
      this.sendPayment({
        receiver: this.highestBidder.value,
        amount: this.highestBid.value,
        fee: this.MIN_TXN_FEE,
      });
    }

    // Return asset to creator
    this.sendAssetTransfer({
      xferAsset: this.assetId.value,
      assetReceiver: this.app.creator,
      assetAmount: 1n,
      fee: this.MIN_TXN_FEE,
    });

    this.resetAuctionState();
    this.log('Auction cancelled and asset returned to creator');
  }

  @abimethod({ allowActions: ['DeleteApplication'] })
  deleteApplication(): void {
    this.assertSenderIsCreator();

    // Ensure no active auction
    if (this.auctionActive.value && this.hasValidBid()) {
      throw new Error('Cannot delete contract with active bids. Cancel auction first.');
    }

    // Close out asset position and return any remaining balance
    this.sendAssetTransfer({
      xferAsset: this.assetId.value,
      assetReceiver: this.app.creator,
      assetAmount: 0n,
      assetCloseTo: this.app.creator,
      fee: this.MIN_TXN_FEE,
    });

    // Close out ALGO balance
    this.sendPayment({
      receiver: this.app.creator,
      amount: 0n,
      closeRemainderTo: this.app.creator,
      fee: this.MIN_TXN_FEE,
    });

    this.log('Contract deleted and all assets returned to creator');
  }

  // View methods
  @abimethod({ allowActions: ['NoOp'], readonly: true })
  getAuctionInfo(): [uint64, uint64, uint64, Address, uint64, boolean] {
    return [
      this.assetId.value,
      this.floorPrice.value,
      this.highestBid.value,
      this.highestBidder.value,
      this.auctionEndTime.value,
      this.auctionActive.value
    ];
  }

  @abimethod({ allowActions: ['NoOp'], readonly: true })
  getTimeRemaining(): uint64 {
    if (this.txn.lastValid >= this.auctionEndTime.value) {
      return 0n;
    }
    return this.auctionEndTime.value - this.txn.lastValid;
  }

  @abimethod({ allowActions: ['NoOp'], readonly: true })
  isAuctionEnded(): boolean {
    return this.txn.lastValid > this.auctionEndTime.value;
  }

  // Private helper methods
  private executeAuctionSettlement(): void {
    // Transfer asset to winner
    this.sendAssetTransfer({
      xferAsset: this.assetId.value,
      assetReceiver: this.highestBidder.value,
      assetAmount: 1n,
      fee: this.MIN_TXN_FEE,
    });

    // Pay creator
    this.sendPayment({
      receiver: this.app.creator,
      amount: this.highestBid.value,
      fee: this.MIN_TXN_FEE,
    });

    this.resetAuctionState();
  }

  private resetAuctionState(): void {
    this.highestBid.value = 0n;
    this.highestBidder.value = this.NO_BIDDER;
    this.assetEscrowed.value = false;
    this.auctionActive.value = false;
  }

  private assertSenderIsCreator(): void {
    if (this.txn.sender !== this.app.creator) {
      throw new Error('Only contract creator can perform this action');
    }
  }

  private assertAuctionActive(): void {
    if (!this.assetEscrowed.value || !this.auctionActive.value) {
      throw new Error('Auction is not currently active');
    }
  }

  private assertAuctionNotStarted(): void {
    if (this.auctionActive.value) {
      throw new Error('Cannot modify auction after it has started');
    }
  }

  private assertAuctionNotEnded(): void {
    if (this.txn.lastValid > this.auctionEndTime.value) {
      throw new Error('Auction has already ended');
    }
  }

  private hasValidBid(): boolean {
    return this.highestBidder.value !== this.NO_BIDDER && this.highestBid.value > 0n;
  }
}

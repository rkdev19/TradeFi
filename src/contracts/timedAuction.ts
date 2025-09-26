import {
  Contract,
  abimethod,
  Address,
  uint64,
  Asset,
  PaymentTxn,
  AssetTransferTxn,
  BoxMap,
  GlobalStateKey,
} from '@algorandfoundation/algorand-typescript';

export class TimedAuctionContract extends Contract {
  // --- State Variables ---
  assetId = GlobalStateKey<uint64>({ key: 'asset_id' });
  floorPrice = GlobalStateKey<uint64>({ key: 'floor_price' });
  highestBid = GlobalStateKey<uint64>({ key: 'highest_bid' });
  highestBidder = GlobalStateKey<Address>({ key: 'highest_bidder' });
  auctionEndTime = GlobalStateKey<uint64>({ key: 'auction_end' });
  totalEscrowedAmount = GlobalStateKey<uint64>({ key: 'total_escrowed' });
  activeBiddersCount = GlobalStateKey<uint64>({ key: 'active_bidders' });
  isEscrowActive = GlobalStateKey<boolean>({ key: 'escrow_active' });
  assetEscrowed = GlobalStateKey<boolean>({ key: 'asset_escrowed' });

  // Box storage for managing bidder escrows
  // Key: bidder address, Value: cumulative escrowed amount
  bidderEscrows = new BoxMap<Address, uint64>();

  // Constants
  private readonly NO_BIDDER = Address.zeroAddress;
  private readonly MIN_TXN_FEE: uint64 = 1000n;
  private readonly MIN_AUCTION_DURATION: uint64 = 300n; // 5 minutes
  private readonly MAX_AUCTION_DURATION: uint64 = 2592000n; // 30 days
  private readonly BLOCK_TIME_SECONDS = 4.5;

  @abimethod({ allowActions: ['NoOp'], onCreate: 'require' })
  createApplication(
    asset: Asset,
    floorPrice: uint64,
    auctionDurationSeconds: uint64
  ): void {
    // Input validation
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
    this.totalEscrowedAmount.value = 0n;
    this.activeBiddersCount.value = 0n;
    this.isEscrowActive.value = false; // Start inactive until asset is escrowed
    this.assetEscrowed.value = false;

    // Calculate auction end time
    const roundsToAdd = BigInt(Math.ceil(Number(auctionDurationSeconds) / this.BLOCK_TIME_SECONDS));
    this.auctionEndTime.value = this.txn.lastValid + roundsToAdd;

    this.log(`Auction created: Asset ${asset.id}, Floor ${floorPrice}, Duration ${auctionDurationSeconds}s`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  updateFloorPrice(newFloorPrice: uint64): void {
    this.assertSenderIsCreator();
    this.assertAuctionNotStarted();

    if (newFloorPrice === 0n) {
      throw new Error('Floor price must be greater than 0');
    }

    this.floorPrice.value = newFloorPrice;
    this.log(`Floor price updated to ${newFloorPrice}`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  optInToAsset(mbr_payment: PaymentTxn): void {
    this.assertSenderIsCreator();

    if (this.app.address.isOptedInToAsset(this.assetId.value)) {
      throw new Error('Contract already opted into asset');
    }

    // Validate MBR payment
    const requiredMBR = this.app.minBalance + this.app.assetOptInMinBalance;
    if (mbr_payment.receiver !== this.app.address || mbr_payment.amount < requiredMBR) {
      throw new Error(`Invalid MBR payment. Required: ${requiredMBR} microALGOs`);
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
      throw new Error('Must transfer exactly 1 unit of the auction asset to contract');
    }

    this.assetEscrowed.value = true;
    this.isEscrowActive.value = true; // Activate bidding
    
    this.log(`Asset ${this.assetId.value} escrowed, auction now active`);
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
    if (bid_payment.sender !== this.txn.sender || bid_payment.receiver !== this.app.address) {
      throw new Error('Invalid bid payment transaction');
    }

    if (bid_payment.amount === 0n) {
      throw new Error('Bid amount must be greater than 0');
    }

    const bidder = this.txn.sender;
    const bidAmount = bid_payment.amount;
    const currentEscrow = this.bidderEscrows.get(bidder).value || 0n;
    const totalBidAmount = currentEscrow + bidAmount;

    // Validate bid requirements
    if (totalBidAmount < this.floorPrice.value) {
      throw new Error(`Total bid must meet floor price of ${this.floorPrice.value} microALGOs`);
    }

    if (totalBidAmount <= this.highestBid.value) {
      throw new Error(`Total bid must exceed current highest bid of ${this.highestBid.value} microALGOs`);
    }

    // Update bidder's escrow
    if (currentEscrow === 0n) {
      this.activeBiddersCount.value += 1n;
    }
    this.bidderEscrows.set(bidder, totalBidAmount);
    this.totalEscrowedAmount.value += bidAmount;

    // Update highest bid tracking
    this.highestBid.value = totalBidAmount;
    this.highestBidder.value = bidder;

    this.log(`New highest bid: ${totalBidAmount} microALGOs by ${bidder} (added ${bidAmount})`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  increaseBid(additional_payment: PaymentTxn): void {
    // Alias for placeBid to make intent clearer
    this.placeBid(additional_payment);
  }

  @abimethod({ allowActions: ['NoOp'] })
  withdrawBid(): void {
    if (this.isEscrowActive.value) {
      throw new Error('Cannot withdraw while auction is active. Wait for auction to end or be cancelled.');
    }

    const bidder = this.txn.sender;
    const escrowedAmount = this.bidderEscrows.get(bidder).value;

    if (escrowedAmount === undefined || escrowedAmount === 0n) {
      throw new Error('No escrowed funds found for this address');
    }

    // Process withdrawal
    this.sendPayment({
      receiver: bidder,
      amount: escrowedAmount,
      fee: this.MIN_TXN_FEE,
    });

    // Update contract state
    this.bidderEscrows.delete(bidder);
    this.totalEscrowedAmount.value -= escrowedAmount;
    this.activeBiddersCount.value -= 1n;

    this.log(`Withdrew ${escrowedAmount} microALGOs for ${bidder}`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  finalizeAuction(): void {
    if (this.txn.lastValid <= this.auctionEndTime.value) {
      throw new Error('Auction has not yet ended');
    }

    this.endAuction();
    this.log('Auction finalized due to time expiration');
  }

  @abimethod({ allowActions: ['NoOp'] })
  acceptBid(): void {
    this.assertSenderIsCreator();
    this.assertAuctionActive();

    if (this.highestBidder.value === this.NO_BIDDER) {
      throw new Error('No bids to accept');
    }

    this.endAuction();
    this.log(`Bid accepted early by creator: ${this.highestBid.value} microALGOs`);
  }

  @abimethod({ allowActions: ['NoOp'] })
  cancelAuction(): void {
    this.assertSenderIsCreator();
    this.assertAuctionActive();

    // Simply deactivate escrow - all bidders can then withdraw
    this.isEscrowActive.value = false;

    // Return asset to creator
    if (this.assetEscrowed.value) {
      this.sendAssetTransfer({
        xferAsset: this.assetId.value,
        assetReceiver: this.app.creator,
        assetAmount: 1n,
        fee: this.MIN_TXN_FEE,
      });
      this.assetEscrowed.value = false;
    }

    this.log('Auction cancelled by creator - all bidders can now withdraw funds');
  }

  @abimethod({ allowActions: ['DeleteApplication'] })
  deleteApplication(): void {
    this.assertSenderIsCreator();

    // Ensure all funds have been withdrawn
    if (this.totalEscrowedAmount.value > 0n) {
      throw new Error('Cannot delete application while funds are still escrowed. All bidders must withdraw first.');
    }

    // Ensure auction is not active
    if (this.isEscrowActive.value) {
      throw new Error('Cannot delete active auction. Cancel auction first.');
    }

    // Close out asset position
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

    this.log('Contract deleted, all assets returned to creator');
  }

  // --- Read-only View Methods ---

  @abimethod({ allowActions: ['NoOp'], readonly: true })
  getAuctionInfo(): [uint64, uint64, uint64, Address, uint64, boolean, boolean] {
    return [
      this.assetId.value,
      this.floorPrice.value,
      this.highestBid.value,
      this.highestBidder.value,
      this.auctionEndTime.value,
      this.isEscrowActive.value,
      this.assetEscrowed.value
    ];
  }

  @abimethod({ allowActions: ['NoOp'], readonly: true })
  getEscrowInfo(): [uint64, uint64] {
    return [
      this.totalEscrowedAmount.value,
      this.activeBiddersCount.value
    ];
  }

  @abimethod({ allowActions: ['NoOp'], readonly: true })
  getBidderEscrow(bidder: Address): uint64 {
    return this.bidderEscrows.get(bidder).value || 0n;
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

  @abimethod({ allowActions: ['NoOp'], readonly: true })
  canWithdraw(bidder: Address): boolean {
    if (this.isEscrowActive.value) return false;
    const escrowedAmount = this.bidderEscrows.get(bidder).value || 0n;
    return escrowedAmount > 0n;
  }

  // --- Private Helper Methods ---

  private endAuction(): void {
    if (!this.isEscrowActive.value) {
      throw new Error('Auction already ended');
    }

    if (this.highestBidder.value !== this.NO_BIDDER) {
      const winningAmount = this.bidderEscrows.get(this.highestBidder.value).value || 0n;
      
      if (winningAmount === 0n) {
        throw new Error('Invalid auction state: winner has no escrowed funds');
      }

      // Transfer asset to winner
      this.sendAssetTransfer({
        xferAsset: this.assetId.value,
        assetReceiver: this.highestBidder.value,
        assetAmount: 1n,
        fee: this.MIN_TXN_FEE,
      });

      // Transfer winning bid to creator
      this.sendPayment({
        receiver: this.app.creator,
        amount: winningAmount,
        fee: this.MIN_TXN_FEE,
      });

      // Update state for the winner
      this.bidderEscrows.delete(this.highestBidder.value);
      this.totalEscrowedAmount.value -= winningAmount;
      this.activeBiddersCount.value -= 1n;
      this.assetEscrowed.value = false;

      this.log(`Auction won by ${this.highestBidder.value} for ${winningAmount} microALGOs`);
    } else {
      // No bids - return asset to creator
      if (this.assetEscrowed.value) {
        this.sendAssetTransfer({
          xferAsset: this.assetId.value,
          assetReceiver: this.app.creator,
          assetAmount: 1n,
          fee: this.MIN_TXN_FEE,
        });
        this.assetEscrowed.value = false;
      }
      this.log('Auction ended with no bids');
    }

    // Deactivate escrow to allow remaining bidders to withdraw
    this.isEscrowActive.value = false;
  }

  private assertSenderIsCreator(): void {
    if (this.txn.sender !== this.app.creator) {
      throw new Error('Only contract creator can perform this action');
    }
  }

  private assertAuctionActive(): void {
    if (!this.isEscrowActive.value || !this.assetEscrowed.value) {
      throw new Error('Auction is not currently active');
    }
  }

  private assertAuctionNotStarted(): void {
    if (this.isEscrowActive.value) {
      throw new Error('Cannot modify auction parameters after bidding has started');
    }
  }

  private assertAuctionNotEnded(): void {
    if (this.txn.lastValid > this.auctionEndTime.value) {
      throw new Error('Auction has already ended');
    }
  }
}

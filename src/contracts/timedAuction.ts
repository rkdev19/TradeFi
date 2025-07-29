import {
  Contract,
  abimethod,
  Address,
  uint64,
  Asset,
  PaymentTxn,
  BoxMap
} from '@algorandfoundation/algorand-typescript';

export class TimedAuctionContract extends Contract {
  // --- State Variables ---
  assetId: uint64;
  floorPrice: uint64;
  highestBid: uint64;
  highestBidder: Address;
  auctionEndTime: uint64;
  totalEscrowedAmount: uint64;
  activeBiddersCount: uint64;
  isEscrowActive: boolean;

  // Box storage for managing bidder escrows
  // Key: bidder address, Value: cumulative escrowed amount
  bidderEscrows = new BoxMap<Address, uint64>();

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
    this.totalEscrowedAmount = 0;
    this.activeBiddersCount = 0;
    this.isEscrowActive = true;

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
    // Note: The asset being auctioned must be escrowed separately by the creator
    this.assertSenderIsCreator();

    if (this.app.address.isOptedInToAsset(this.assetId)) {
      throw new Error("Already opted in to asset");
    }

    if (mbrpay.receiver !== this.app.address ||
        mbrpay.amount < this.app.minBalance + this.app.assetOptInMinBalance) {
      throw new Error("Invalid MBR payment for asset opt-in");
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
      throw new Error("Bidding is no longer active for this auction");
    }

    if (bidPayment.sender !== this.txn.sender ||
        bidPayment.receiver !== this.app.address) {
      throw new Error("Bid payment transaction is invalid");
    }

    const bidder = this.txn.sender;
    const bidAmount = bidPayment.amount;
    const currentEscrow = this.bidderEscrows.get(bidder).value || 0;
    const totalBidAmount = currentEscrow + bidAmount;

    if (totalBidAmount < this.floorPrice) {
        throw new Error("Total bid must meet or exceed the floor price");
    }

    if (totalBidAmount <= this.highestBid) {
      throw new Error("Bid must be higher than current highest bid");
    }

    // Update or create escrow box for the bidder
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
    // Users can only withdraw their funds AFTER the auction is no longer active.
    if (this.isEscrowActive) {
      throw new Error("Cannot withdraw while auction is active. Please wait for it to end.");
    }

    const bidder = this.txn.sender;
    const escrowedAmount = this.bidderEscrows.get(bidder).value;

    if (escrowedAmount === undefined || escrowedAmount === 0) {
      throw new Error("No escrowed amount found for this address");
    }

    // Process withdrawal payment
    this.sendPayment({
      receiver: bidder,
      amount: escrowedAmount,
      fee: 1000 // Inner transaction fee
    });

    // Update contract state
    this.bidderEscrows.delete(bidder);
    this.totalEscrowedAmount -= escrowedAmount;
    this.activeBiddersCount -= 1;
  }

  @abimethod()
  finalizeAuction(): void {
    if (this.txn.lastValid <= this.auctionEndTime) {
      throw new Error("Auction has not yet ended");
    }

    this.endAuction();
  }

  @abimethod()
  acceptBid(): void {
    this.assertSenderIsCreator();
    this.endAuction();
  }

  @abimethod()
  rejectBid(): void {
    this.assertSenderIsCreator();
    // Simply deactivate escrow - all bidders can then call withdrawBid()
    this.isEscrowActive = false;
  }
  @abimethod({ allowActions: ['DeleteApplication'] })
    deleteApplication(): void {
      this.assertSenderIsCreator();
  
      // Ensure all funds have been withdrawn before deletion
      if (this.totalEscrowedAmount > 0) {
        throw new Error("Cannot delete application while funds are still escrowed");
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
  
    // --- Private Utility Functions ---
  
    private endAuction(): void {
      if (!this.isEscrowActive) {
        throw new Error("Auction already ended");
      }
  
      if (this.highestBidder.toString() !== this.NO_BIDDER.toString()) {
        const winningAmount = this.bidderEscrows.get(this.highestBidder).value || 0;
        
        // Transfer asset to highest bidder
        this.sendAssetTransfer({
          xferAsset: this.assetId,
          assetReceiver: this.highestBidder,
          assetAmount: 1,
          fee: 1000
        });
  
        // Transfer winning bid to creator
        this.sendPayment({
          receiver: this.app.creator,
          amount: winningAmount,
          fee: 1000
        });
  
        // Update state for the winner
        this.bidderEscrows.delete(this.highestBidder);
        this.totalEscrowedAmount -= winningAmount;
        this.activeBiddersCount -= 1;
      }
  
      // Deactivate escrow to allow all remaining (losing) bidders to withdraw their funds
      this.isEscrowActive = false;
    }
  
    private assertSenderIsCreator(): void {
      if (this.txn.sender.toString() !== this.app.creator.toString()) {
        throw new Error("Only the creator can perform this action");
      }
    }
  }

import { TransactionSigner } from 'algosdk'
import { AuctionXClient } from './contracts/TenderFi'

export function createAuction(
  client: AuctionXClient,
  auctionId: number,
  startTime: number,
  endTime: number,
  minBidIncrement: number,
  minBidAmount: number,
  maxBidAmount: number,
  transactionSigner: TransactionSigner,
) {}

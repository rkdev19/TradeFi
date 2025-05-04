# TradeFi

**TradeFi** is a TypeScript/JavaScript package designed to accelerate the development of auction-based marketplaces on the Algorand blockchain. It provides high-level, developer-friendly APIs to manage assets (ASAs) and timed auctions using smart contracts, making it easy to integrate blockchain-based auction functionality into your dApps.

---

## 🚀 Features

- Create and manage Algorand Standard Assets (ASAs)
- Initialize and manage timed auction smart contracts
- Place bids, finalize auctions, accept/reject bids
- Easily fetch auction details and active auction listings
- Powered by Algorand SDK and `algokit-utils`

---

## 📦 Installation

```bash
npm install tradefi
# or
yarn add tradefi
```

---

## 🛠️ Usage

### 1. Initialize the Client

```ts
import algosdk from 'algosdk';
import { MarketplaceClient } from 'tradefi';

const algod = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '');
const indexer = new algosdk.Indexer('', 'https://testnet-idx.algonode.cloud', '');
const signer = async (txns: algosdk.Transaction[], indexes: number[]) => {
  // implement your signer logic (e.g. wallet connection)
};

const marketplace = new MarketplaceClient(algod, indexer, signer);
```

---

### 2. Asset Management

#### Create ASA

```ts
const assetId = await marketplace.createAsset(
  creatorAddress,
  'MyToken',
  'MTK',
  1000,
  0
);
```

#### Opt-in to Asset

```ts
await marketplace.optInToAsset(accountAddress, assetId);
```

#### Transfer Asset

```ts
await marketplace.transferAsset(sender, receiver, assetId, 1);
```

#### Get Asset Info

```ts
const info = await marketplace.getAssetInfo(assetId);
```

---

### 3. Auction Management

#### Create Auction

```ts
const appId = await marketplace.auction.createAuction({
  creator: creatorAddress,
  assetId: assetId,
  floorPrice: 1000000, // in microAlgos
  durationInSeconds: 300
});
```

#### Place Bid

```ts
await marketplace.auction.placeBid({
  appId,
  bidder: bidderAddress,
  bidAmount: 1500000
});
```

#### Finalize Auction

```ts
await marketplace.auction.finalizeAuction(appId, senderAddress);
```

#### Accept / Reject Bid

```ts
await marketplace.auction.acceptBid(appId, creatorAddress);
await marketplace.auction.rejectBid(appId, creatorAddress);
```

#### Get Auction Info

```ts
const auction = await marketplace.auction.getAuctionInfo(appId);
```

#### List Active Auctions

```ts
const activeAuctions = await marketplace.auction.listActiveAuctions();
```

---

## 📘 Types

Types used throughout the SDK are defined under `types/` and include:

---

## ✅ Requirements

- Node.js 16+
- Algorand Smart Contracts deployed (via `algokit` or custom)
- Signer function that signs Algorand transactions

---

## 🧪 Testing

You can test the SDK against Algorand TestNet using your test accounts and a deployed version of the timed auction smart contract.

---

## 🤝 Contributing

Pull requests and feedback are welcome! If you want to contribute a feature, fix, or enhancement, feel free to open an issue or PR.

---

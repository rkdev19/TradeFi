import { AlgorandClient } from '@algorandfoundation/algokit-utils';
import { Account } from '@algorandfoundation/algokit-utils/types/account';
import { TimedAuctionClient } from '../artifacts/timed_auction/TimedAuctionClient';

/**
 * Creates a dummy NFT asset for testing the auction
 */
async function createDummyAsset(client: AlgorandClient, creator: Account): Promise<number> {
  console.log('Creating dummy auction asset...');
  
  const tx = await client.send.assetCreate({
    sender: creator.addr,
    assetName: 'AUCTION_ITEM',
    unitName: 'ITEM',
    total: 1,
    decimals: 0,
    manager: creator.addr,
    reserve: creator.addr,
    freeze: creator.addr,
    clawback: creator.addr,
  });

  if (!tx.confirmation || tx.confirmation.assetIndex === undefined) {
    throw new Error('Asset creation failed: no assetIndex in confirmation');
  }

  const assetId = Number(tx.confirmation.assetIndex);
  console.log(`✅ Created asset with ID: ${assetId}`);
  return assetId;
}

/**
 * Sets up the auction after deployment (opt-in and escrow)
 */
async function setupAuction(
  client: AlgorandClient, 
  auctionClient: TimedAuctionClient, 
  deployer: Account, 
  assetId: number,
  appAddress: string
): Promise<void> {
  console.log('\nSetting up auction...');

  try {
    // Step 1: Calculate MBR and opt into asset
    console.log('Step 1: Opting contract into asset...');
    
    // Send MBR payment for asset opt-in (0.1 ALGO minimum)
    const mbrAmount = (0.1).algo();
    
    await auctionClient.optInToAsset({
      mbr_payment: await client.transactions.payment({
        sender: deployer.addr,
        receiver: appAddress,
        amount: mbrAmount,
      })
    });
    console.log('✅ Contract opted into asset');

    // Step 2: Transfer asset to contract (escrow)
    console.log('Step 2: Escrowing asset in contract...');
    
    await auctionClient.escrowAsset({
      asset_txn: await client.transactions.assetTransfer({
        sender: deployer.addr,
        assetReceiver: appAddress,
        xferAsset: assetId,
        assetAmount: 1,
      })
    });
    console.log('✅ Asset escrowed successfully');

    // Verify setup by checking auction info
    const auctionInfo = await auctionClient.getAuctionInfo({});
    console.log('\n📊 Auction Status:');
    console.log(`- Asset ID: ${auctionInfo.return[0]}`);
    console.log(`- Floor Price: ${auctionInfo.return[1]} microALGOs (${Number(auctionInfo.return[1]) / 1_000_000} ALGO)`);
    console.log(`- Current Bid: ${auctionInfo.return[2]} microALGOs`);
    console.log(`- Highest Bidder: ${auctionInfo.return[3]}`);
    console.log(`- End Round: ${auctionInfo.return[4]}`);
    console.log(`- Active: ${auctionInfo.return[5]}`);

  } catch (error) {
    console.error('❌ Auction setup failed:', error);
    throw error;
  }
}

/**
 * Creates a test bidder account and places a bid
 */
async function createTestBidder(client: AlgorandClient): Promise<Account> {
  const bidder = await client.account.random();
  await client.fund.ensure(bidder, (2).algo()); // Fund with 2 ALGO
  console.log(`Created test bidder: ${bidder.addr}`);
  return bidder;
}

/**
 * Places a test bid on the auction
 */
async function placeBid(
  client: AlgorandClient,
  auctionClient: TimedAuctionClient,
  bidder: Account,
  bidAmount: bigint,
  appAddress: string
): Promise<void> {
  console.log(`\nPlacing bid of ${Number(bidAmount) / 1_000_000} ALGO...`);

  try {
    // Create a new client instance for the bidder
    const bidderAuctionClient = new TimedAuctionClient(
      {
        sender: bidder,
        resolveBy: 'id',
        id: auctionClient.appId,
      },
      client.client.algod
    );

    await bidderAuctionClient.placeBid({
      bid_payment: await client.transactions.payment({
        sender: bidder.addr,
        receiver: appAddress,
        amount: bidAmount,
      })
    });

    console.log('✅ Bid placed successfully!');

    // Check updated auction info
    const auctionInfo = await auctionClient.getAuctionInfo({});
    console.log(`📊 New highest bid: ${Number(auctionInfo.return[2]) / 1_000_000} ALGO by ${auctionInfo.return[3]}`);

  } catch (error) {
    console.error('❌ Bid placement failed:', error);
    throw error;
  }
}

/**
 * Demonstrates auction finalization (early acceptance by creator)
 */
async function demonstrateAcceptBid(auctionClient: TimedAuctionClient): Promise<void> {
  console.log('\nDemonstrating early bid acceptance by creator...');

  try {
    await auctionClient.acceptBid({});
    console.log('✅ Bid accepted! Auction completed early.');
    
    // Check final status
    const auctionInfo = await auctionClient.getAuctionInfo({});
    console.log('📊 Final auction status:');
    console.log(`- Active: ${auctionInfo.return[5]}`);
    console.log(`- Final bid: ${Number(auctionInfo.return[2]) / 1_000_000} ALGO`);

  } catch (error) {
    console.error('❌ Bid acceptance failed:', error);
    throw error;
  }
}

/**
 * Main deployment and demonstration function
 */
export async function deployTimedAuction(): Promise<void> {
  console.log('🚀 Starting TimedAuction deployment and demo...\n');

  try {
    // Setup client & deployer
    const client = AlgorandClient.fromEnvironment();
    const deployer = await client.account.fromEnvironment('DEPLOYER');
    
    // Ensure deployer has sufficient funds
    await client.fund.ensure(deployer, (5).algo());
    console.log(`Deployer account: ${deployer.addr}`);

    // Create the dummy asset for auction
    const assetId = await createDummyAsset(client, deployer);

    // Setup the auction app client
    const auctionClient = new TimedAuctionClient(
      {
        sender: deployer,
        resolveBy: 'id',
        id: 0, // using new deployment
      },
      client.client.algod
    );

    // Deploy the application (smart contract)
    console.log('\nDeploying auction contract...');
    const { appId, appAddress, transaction } = await auctionClient.create.createApplication({
      asset: assetId,
      floorPrice: (0.1).algo(), // 0.1 ALGO floor price
      auctionDurationSeconds: 3600, // 1 hour duration
    });

    console.log(`✅ Contract deployed successfully!`);
    console.log(`- App ID: ${appId}`);
    console.log(`- App Address: ${appAddress}`);
    console.log(`- Transaction ID: ${transaction.txID()}`);

    // Fund the app address for operations
    console.log('\nFunding contract for operations...');
    await client.send.payment({
      amount: (2).algo(), // 2 ALGO for operations and MBR
      sender: deployer.addr,
      receiver: appAddress,
    });
    console.log('✅ Contract funded');

    // Setup the auction (opt-in and escrow)
    await setupAuction(client, auctionClient, deployer, assetId, appAddress);

    console.log('\n🎉 Auction is now live and ready for bidding!');
    
    // Demonstrate bidding flow
    console.log('\n--- DEMO: Bidding Flow ---');
    
    // Create test bidders and place bids
    const bidder1 = await createTestBidder(client);
    const bidder2 = await createTestBidder(client);

    // Place some test bids
    await placeBid(client, auctionClient, bidder1, (0.2).algo(), appAddress); // 0.2 ALGO bid
    await placeBid(client, auctionClient, bidder2, (0.3).algo(), appAddress); // 0.3 ALGO bid
    await placeBid(client, auctionClient, bidder1, (0.5).algo(), appAddress); // 0.5 ALGO bid

    // Demonstrate early acceptance
    await demonstrateAcceptBid(auctionClient);

    console.log('\n🎊 Demo completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`- Auction Contract ID: ${appId}`);
    console.log(`- Asset ID: ${assetId}`);
    console.log(`- Final Winner: ${bidder1.addr}`);
    console.log(`- Winning Bid: 0.5 ALGO`);

  } catch (error) {
    console.error('❌ Deployment failed:', error);
    console.error(error);
    throw error;
  }
}

/**
 * Utility function to get auction status
 */
export async function getAuctionStatus(appId: number): Promise<void> {
  const client = AlgorandClient.fromEnvironment();
  const deployer = await client.account.fromEnvironment('DEPLOYER');
  
  const auctionClient = new TimedAuctionClient(
    {
      sender: deployer,
      resolveBy: 'id',
      id: appId,
    },
    client.client.algod
  );

  try {
    const info = await auctionClient.getAuctionInfo({});
    const timeRemaining = await auctionClient.getTimeRemaining({});
    const hasEnded = await auctionClient.isAuctionEnded({});

    console.log('\n📊 Current Auction Status:');
    console.log(`- Asset ID: ${info.return[0]}`);
    console.log(`- Floor Price: ${Number(info.return[1]) / 1_000_000} ALGO`);
    console.log(`- Highest Bid: ${Number(info.return[2]) / 1_000_000} ALGO`);
    console.log(`- Highest Bidder: ${info.return[3]}`);
    console.log(`- End Round: ${info.return[4]}`);
    console.log(`- Active: ${info.return[5]}`);
    console.log(`- Time Remaining: ${timeRemaining.return} rounds`);
    console.log(`- Has Ended: ${hasEnded.return}`);

  } catch (error) {
    console.error('Failed to get auction status:', error);
  }
}

/**
 * Clean up function to delete the contract
 */
export async function cleanupAuction(appId: number): Promise<void> {
  const client = AlgorandClient.fromEnvironment();
  const deployer = await client.account.fromEnvironment('DEPLOYER');
  
  const auctionClient = new TimedAuctionClient(
    {
      sender: deployer,
      resolveBy: 'id',
      id: appId,
    },
    client.client.algod
  );

  try {
    await auctionClient.delete.deleteApplication({});
    console.log('✅ Contract deleted and assets reclaimed');
  } catch (error) {
    console.error('Failed to delete contract:', error);
  }
}

// Export the main function as default
export default deployTimedAuction;

// If running this file directly
if (require.main === module) {
  deployTimedAuction().catch(console.error);
}

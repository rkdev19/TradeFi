import { AlgorandClient } from '@algorandfoundation/algokit-utils';
import { TimedAuctionFactory } from '../artifacts/timed_auction/TimedAuctionClient';
import { microAlgos } from '@algorandfoundation/algokit-utils';

export async function deployTimedAuction(): Promise<void> {
  console.log('Starting TimedAuction deployment...');
  
  try {
    // Initialize Algorand client and deployer account
    const algorand = AlgorandClient.fromEnvironment();
    const deployer = await algorand.account.fromEnvironment('DEPLOYER');
    
    console.log(`Deploying with account: ${deployer.addr}`);

    // Get the typed app factory
    const factory = algorand.client.getTypedAppFactory(TimedAuctionFactory, {
      defaultSender: deployer.addr,
    });

    // Example auction parameters - modify these as needed
    const EXAMPLE_ASSET_ID = 12345678; // Replace with actual asset ID
    const FLOOR_PRICE = microAlgos(1_000_000); // 1 ALGO floor price
    const AUCTION_DURATION = 3600; // 1 hour in seconds

    // Deploy the contract
    console.log('Deploying contract...');
    const { appClient, result } = await factory.deploy({
      onUpdate: 'append',
      onSchemaBreak: 'replace',
      deployArgs: {
        asset: EXAMPLE_ASSET_ID,
        floorPrice: FLOOR_PRICE,
        auctionDurationSeconds: AUCTION_DURATION,
      },
    });

    console.log(`Contract deployment result: ${result.operationPerformed}`);
    console.log(`App ID: ${appClient.appClient.appId}`);
    console.log(`App Address: ${appClient.appAddress}`);

    // Fund the contract with initial ALGO for operations
    if (['create', 'replace'].includes(result.operationPerformed)) {
      console.log('Funding contract with initial ALGO...');
      
      await algorand.send.payment({
        amount: microAlgos(2_000_000), // 2 ALGO for operations
        sender: deployer.addr,
        receiver: appClient.appAddress,
      });
      
      console.log('Contract funded successfully');
    }

    // Get auction info to verify deployment
    console.log('Verifying deployment by checking auction info...');
    const auctionInfo = await appClient.send.getAuctionInfo({
      args: {},
    });

    console.log('Auction Information:');
    console.log(`- Asset ID: ${auctionInfo.return[0]}`);
    console.log(`- Floor Price: ${auctionInfo.return[1]} microALGOs`);
    console.log(`- Current Highest Bid: ${auctionInfo.return[2]} microALGOs`);
    console.log(`- Highest Bidder: ${auctionInfo.return[3]}`);
    console.log(`- Auction End Time (round): ${auctionInfo.return[4]}`);
    console.log(`- Auction Active: ${auctionInfo.return[5]}`);

    console.log('\n✅ TimedAuction deployment completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Call optInToAsset() with MBR payment');
    console.log('2. Call escrowAsset() to deposit the auction asset');
    console.log('3. Bidders can then call placeBid() to participate');

  } catch (error) {
    console.error('❌ Deployment failed:', error);
    throw error;
  }
}

// Additional utility functions for auction management
export async function setupAuction(
  appClient: any,
  deployer: any,
  assetId: number,
  algorand: AlgorandClient
): Promise<void> {
  console.log('\nSetting up auction...');

  try {
    // Step 1: Calculate and send MBR for asset opt-in
    const appInfo = await algorand.client.algod.getApplicationByID(appClient.appClient.appId).do();
    const minBalance = appInfo.params['global-state-schema']['num-byte-slice'] * 50000 + 
                      appInfo.params['global-state-schema']['num-uint'] * 28500 + 100000;
    const assetOptInMBR = 100000; // 0.1 ALGO for asset opt-in
    
    console.log('Step 1: Sending MBR payment for asset opt-in...');
    await appClient.send.optInToAsset({
      args: {
        mbr_payment: {
          sender: deployer.addr,
          receiver: appClient.appAddress,
          amount: minBalance + assetOptInMBR,
        },
      },
    });
    console.log('✅ Asset opt-in completed');

    // Step 2: Transfer asset to contract (escrow)
    console.log('Step 2: Escrowing asset...');
    await appClient.send.escrowAsset({
      args: {
        asset_txn: {
          sender: deployer.addr,
          assetReceiver: appClient.appAddress,
          xferAsset: assetId,
          assetAmount: 1,
        },
      },
    });
    console.log('✅ Asset escrowed successfully');

    console.log('\n🎉 Auction is now ready for bidding!');
    
  } catch (error) {
    console.error('❌ Auction setup failed:', error);
    throw error;
  }
}

export async function placeBidExample(
  appClient: any,
  bidder: any,
  bidAmount: number,
  algorand: AlgorandClient
): Promise<void> {
  console.log(`\nPlacing bid of ${bidAmount} microALGOs...`);

  try {
    const response = await appClient.send.placeBid({
      sender: bidder.addr,
      args: {
        bid_payment: {
          sender: bidder.addr,
          receiver: appClient.appAddress,
          amount: bidAmount,
        },
      },
    });

    console.log('✅ Bid placed successfully!');
    console.log(`Transaction ID: ${response.txId}`);

    // Check updated auction info
    const auctionInfo = await appClient.send.getAuctionInfo({
      args: {},
    });
    
    console.log('\nUpdated Auction Info:');
    console.log(`- Current Highest Bid: ${auctionInfo.return[2]} microALGOs`);
    console.log(`- Highest Bidder: ${auctionInfo.return[3]}`);
    
  } catch (error) {
    console.error('❌ Bid placement failed:', error);
    throw error;
  }
}

export async function finalizeAuctionExample(
  appClient: any,
  caller: any
): Promise<void> {
  console.log('\nFinalizing auction...');

  try {
    // Check if auction has ended
    const hasEnded = await appClient.send.isAuctionEnded({
      args: {},
    });

    if (!hasEnded.return) {
      console.log('⚠️  Auction has not ended yet');
      const timeRemaining = await appClient.send.getTimeRemaining({
        args: {},
      });
      console.log(`Time remaining: ${timeRemaining.return} rounds`);
      return;
    }

    const response = await appClient.send.finalizeAuction({
      sender: caller.addr,
      args: {},
    });

    console.log('✅ Auction finalized successfully!');
    console.log(`Transaction ID: ${response.txId}`);
    
  } catch (error) {
    console.error('❌ Auction finalization failed:', error);
    throw error;
  }
}

// Main execution function for testing
export async function main(): Promise<void> {
  await deployTimedAuction();
  
  // Uncomment and modify the following lines to test the full auction flow:
  /*
  const algorand = AlgorandClient.fromEnvironment();
  const deployer = await algorand.account.fromEnvironment('DEPLOYER');
  const factory = algorand.client.getTypedAppFactory(TimedAuctionFactory, {
    defaultSender: deployer.addr,
  });
  
  // Get the deployed app client (you'd need to store this from deployment)
  const appClient = factory.getAppClientById({ appId: YOUR_APP_ID });
  
  // Setup the auction
  await setupAuction(appClient, deployer, YOUR_ASSET_ID, algorand);
  
  // Place a bid (from a different account)
  const bidder = await algorand.account.fromEnvironment('BIDDER');
  await placeBidExample(appClient, bidder, microAlgos(1_500_000), algorand);
  
  // Wait for auction to end, then finalize
  await finalizeAuctionExample(appClient, deployer);
  */
}

// Export for use in other modules
export { deployTimedAuction as default };

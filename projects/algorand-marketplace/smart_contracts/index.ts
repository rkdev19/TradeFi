import { AlgorandClient } from '@algorandfoundation/algokit-utils';
import { Account } from '@algorandfoundation/algokit-utils/types/account';
import { TimedAuctionClient } from '../artifacts/timed_auction/TimedAuctionClient';

async function createDummyAsset(client: AlgorandClient, creator: Account): Promise<number> {
  const tx = await client.send.assetCreate({
    sender: creator.addr,
    assetName: 'AUCTION_ITEM',
    unitName: 'ITEM',
    total: 1,
    decimals: 0,
  });
  if (!tx.confirmation || tx.confirmation.assetIndex === undefined) {
    throw new Error('Asset creation failed: no assetIndex in confirmation');
  }
  return Number(tx.confirmation.assetIndex);
}

export async function deployTimedAuction(): Promise<void> {
  // Setup client & deployer
  const client = AlgorandClient.fromEnvironment();
  const deployer = await client.account.fromEnvironment('DEPLOYER');

  // Ensure deployer has some funds
  await client.fund.ensure(deployer, (1).algo());

  // Create the dummy asset
  const assetId = await createDummyAsset(client, deployer);

  // Setup the auction app client
  const auctionClient = new TimedAuctionClient(
    {
      sender: deployer,
      resolveBy: 'id',
      id: 0,  // using new deployment
    },
    client.client.algod
  );

  // Deploy the application (smart contract)
  const { appId, appAddress, transaction } = await auctionClient.create.createApplication({
    asset: assetId,
    floorPrice: (0.1).algo(),
    auctionDurationSeconds: 3600,
  });

  // After creation, fund the app address so it can hold ALGO for operations
  await client.send.payment({
    amount: (1).algo(),
    sender: deployer.addr,
    receiver: appAddress,
  });

  console.log(
    `TimedAuction deployed: App ID = ${appId}, Address = ${appAddress}, TxID = ${transaction.txID()}`
  );
}

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
  const assetId = Number(tx.confirmation?.assetIndex);
  return assetId;
}

export async function deployTimedAuction(): Promise<void> {
  const algorand = AlgorandClient.fromEnvironment();
  const deployer = await algorand.account.fromEnvironment('DEPLOYER');

  await algorand.fund.ensure(deployer, (1).algo());

  const assetId = await createDummyAsset(algorand, deployer);

  const auctionClient = new TimedAuctionClient(
    {
      sender: deployer,
      resolveBy: 'id',
      id: 0,
    },
    algorand.client.algod
  );

  const { appId, appAddress, transaction } = await auctionClient.create.createApplication({
    asset: assetId,
    floorPrice: (0.1).algo(),
    auctionDurationSeconds: 3600,
  });

  await algorand.send.payment({
    amount: (1).algo(),
    sender: deployer.addr,
    receiver: appAddress,
  });

  console.log(`TimedAuction deployed — App ID: ${appId}, App Address: ${appAddress}, TxID: ${transaction.txID()}`);
}

import { AlgorandClient } from '@algorandfoundation/algokit-utils';
import { TimedAuctionFactory } from '../artifacts/timed_auction/TimedAuctionClient';

export async function deployTimedAuction(): Promise<void> {
  const algorand = AlgorandClient.fromEnvironment();
  const deployer = await algorand.account.fromEnvironment('DEPLOYER');

  const factory = algorand.client.getTypedAppFactory(TimedAuctionFactory, {
    defaultSender: deployer.addr,
  });

  const { appClient, result } = await factory.deploy({
    onUpdate: 'append',
    onSchemaBreak: 'append',
  });

  if (['create', 'replace'].includes(result.operationPerformed)) {
    await algorand.send.payment({
      amount: (1).algo(),
      sender: deployer.addr,
      receiver: appClient.appAddress,
    });
  }

  const response = await appClient.send.hello({
    args: { name: 'world' },
  });

  console.log(
    `Called hello on ${appClient.appClient.appName} (${appClient.appClient.appId}) with name=world, received: ${response.return}`
  );
}

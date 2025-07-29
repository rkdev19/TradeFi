import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { TimedAuctionFactory } from '../artifacts/timed_auction/TimedAuctionClient'

// === Commit: Setup deployment function for TimedAuction smart contract ===
export async function deploy() {
  console.log('=== Deploying TimedAuction ===')

  // === Commit: Initialize Algorand client and load deployer account from environment ===
  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  // === Commit: Create app factory with deployer as default sender ===
  const factory = algorand.client.getTypedAppFactory(TimedAuctionFactory, {
    defaultSender: deployer.addr,
  })

  // === Commit: Deploy the TimedAuction app with schema/app update handling ===
  const { appClient, result } = await factory.deploy({
    onUpdate: 'append',
    onSchemaBreak: 'append',
  })

  // === Commit: Fund the app account with 1 Algo after creation/replacement ===
  if (['create', 'replace'].includes(result.operationPerformed)) {
    await algorand.send.payment({
      amount: (1).algo(),
      sender: deployer.addr,
      receiver: appClient.appAddress,
    })
  }

  // === Commit: Call the 'hello' method with parameter 'world' ===
  const method = 'hello'
  const response = await appClient.send.hello({
    args: { name: 'world' },
  })

  // === Commit: Log the result of the 'hello' method call ===
  console.log(
    `Called ${method} on ${appClient.appClient.appName} (${appClient.appClient.appId}) with name = world, received: ${response.return}`,
  )
}

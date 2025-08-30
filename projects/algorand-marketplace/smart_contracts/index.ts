import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { Account } from '@algorandfoundation/algokit-utils/types/account'
import { TimedAuctionClient } from '../artifacts/timed_auction/TimedAuctionClient'

/**
 * Create a dummy ASA (Algorand Standard Asset) for auction testing.
 */
async function createDummyAsset(algorand: AlgorandClient, deployer: Account): Promise<number> {
  console.log('--- Creating dummy asset for auction ---')

  const assetCreateTx = await algorand.send.assetCreate({
    sender: deployer.addr,
    assetName: 'AUCTION_ITEM',
    unitName: 'ITEM',
    total: 1,
    decimals: 0,
  })

  const assetId = Number(assetCreateTx.confirmation?.assetIndex)
  console.log(`Dummy asset created with ID: ${assetId}`)

  return assetId
}

/**
 * Deploy the TimedAuction application contract.
 */
export async function deploy() {
  console.log('=== Deploying TimedAuction ===')

  // Setup Algorand client + deployer account
  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  // Ensure deployer has funds
  await algorand.fund.ensure(deployer, (1).algo())
  console.log(`Deployer ${deployer.addr} funded with 1 ALGO`)

  // Create dummy ASA for auction
  const assetId = await createDummyAsset(algorand, deployer)

  // Initialize TimedAuction client
  const appClient = new TimedAuctionClient(
    {
      sender: deployer,
      resolveBy: 'id',
      id: 0, // fresh deployment
    },
    algorand.client.algod,
  )

  // Deploy application
  const { appId, appAddress, transaction } = await appClient.create.createApplication({
    asset: assetId,
    floorPrice: (0.1).algo(), // 0.1 ALGO floor price
    auctionDurationSeconds: 3600, // 1 hour auction
  })

  console.log(
    `TimedAuction deployed.
     App ID: ${appId}
     App Address: ${appAddress}
     TxID: ${transaction.txID()}`
  )

  // Fund contract account with 1 ALGO
  await algorand.send.payment({
    amount: (1).algo(),
    sender: deployer.addr,
    receiver: appAddress,
  })

  console.log(`App account ${appAddress} funded with 1 ALGO.`)
}    },
    algorand.client.algod,
  )

  // Deploy the TimedAuction app
  const { appId, appAddress, transaction } = await appClient.create.createApplication({
    asset: assetId,
    floorPrice: (0.1).algo(), // Example floor price: 0.1 ALGO
    auctionDurationSeconds: 3600, // Example duration: 1 hour
  })

  console.log(
    `TimedAuction app created with App ID: ${appId} and App Address: ${appAddress} in transaction ${transaction.txID()}`,
  )

  // Fund the app account with 1 Algo after creation
  await algorand.send.payment({
    amount: (1).algo(),
    sender: deployer.addr,
    receiver: appAddress,
  })
  console.log(`App account ${appAddress} funded with 1 ALGO.`)
}

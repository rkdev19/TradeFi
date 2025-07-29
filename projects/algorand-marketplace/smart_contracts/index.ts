import { AlgorandClient, SendAtomicTransactionComposerResults } from '@algorandfoundation/algokit-utils'
import { TimedAuctionClient } from '../artifacts/timed_auction/TimedAuctionClient'
import { Account } from '@algorandfoundation/algokit-utils/types/account'

// Helper function to create a dummy asset for the auction
async function createDummyAsset(algorand: AlgorandClient, deployer: Account): Promise<number> {
  console.log('--- Creating dummy asset for auction ---')
  const assetCreate = await algorand.send.assetCreate({
    sender: deployer.addr,
    assetName: 'AUCTION_ITEM',
    unitName: 'ITEM',
    total: 1,
    decimals: 0,
  })
  const assetId = Number(assetCreate.confirmation?.assetIndex)
  console.log(`Dummy asset created with ID: ${assetId}`)
  return assetId
}

export async function deploy() {
  console.log('=== Deploying TimedAuction ===')

  // Initialize Algorand client and deployer account
  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')
  await algorand.fund.ensure(deployer, (1).algo())

  // Create a dummy asset to be auctioned
  const assetId = await createDummyAsset(algorand, deployer);

  // Get an application client
  const appClient = new TimedAuctionClient(
    {
      sender: deployer,
      resolveBy: 'id',
      id: 0,
    },
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

import { TradeFiMarketplace, getAlgodClient, getLocalAccount } from '../src';

async function main() {
  // Connect to local Algorand node
  const algodClient = getAlgodClient();
  
  // Get a test account
  const account = getLocalAccount();
  
  // Initialize the marketplace
  const marketplace = new TradeFiMarketplace(algodClient);
  
  // Deploy the marketplace
  const appId = await marketplace.deployMarketplace(account);
  console.log(`Marketplace deployed with App ID: ${appId}`);
  
  // Create a listing
  const listingId = await marketplace.createListing(account, 123456, 1000000);
  console.log(`Created listing with ID: ${listingId}`);
  
  // Buy the listing
  const success = await marketplace.buyListing(account, listingId);
  console.log(`Purchase ${success ? 'successful' : 'failed'}`);
}

main().catch(console.error);
import algosdk from 'algosdk';
export declare class TradeFiMarketplace {
    private algodClient;
    private appId;
    constructor(algodClient: algosdk.Algodv2, appId?: number);
    deployMarketplace(creator: algosdk.Account): Promise<number>;
    createListing(sender: algosdk.Account, assetId: number, price: number): Promise<string>;
    buyListing(buyer: algosdk.Account, listingId: string): Promise<boolean>;
}

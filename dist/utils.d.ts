import algosdk from 'algosdk';
export declare function getAlgodClient(token?: string, server?: string, port?: string | number): algosdk.Algodv2;
export declare function getLocalAccount(index?: number): algosdk.Account;

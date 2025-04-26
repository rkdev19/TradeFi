import algosdk from 'algosdk';

export function getAlgodClient(
  token: string = '', 
  server: string = 'http://localhost', 
  port: string | number = 4001
): algosdk.Algodv2 {
  return new algosdk.Algodv2(token, server, port);
}

export function getLocalAccount(index: number = 0): algosdk.Account {
  // For development purposes only - would connect to wallet in production
  const kmd = new algosdk.Kmd('a'.repeat(64), 'http://localhost', 4002);
  // Logic to get account from KMD
  return algosdk.generateAccount();
}
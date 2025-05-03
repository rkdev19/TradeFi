import algosdk from 'algosdk';

/**
 * Converts seconds to Algorand rounds (approximately)
 */
export function secondsToRounds(seconds: number): number {
  // Algorand has a block time of approximately 4.5 seconds
  return Math.ceil(seconds / 4.5);
}

/**
 * Converts Algorand rounds to seconds (approximately)
 */
export function roundsToSeconds(rounds: number): number {
  // Algorand has a block time of approximately 4.5 seconds
  return Math.ceil(rounds * 4.5);
}

/**
 * Waits for a transaction to be confirmed
 */
export async function waitForConfirmation(
  algodClient: algosdk.Algodv2,
  txId: string,
  timeout: number = 5
): Promise<any> {
  return await algosdk.waitForConfirmation(algodClient, txId, timeout);
}

/**
 * Encodes a state value for global state lookup
 */
export function encodeStateKey(key: string): string {
  return Buffer.from(key).toString('base64');
}

/**
 * Decodes a state value from global state
 */
export function decodeStateValue(stateItem: any): any {
  if (!stateItem) return null;

  if (stateItem.value.type === 1) {
    return Buffer.from(stateItem.value.bytes, 'base64').toString();
  } else {
    return stateItem.value.uint;
  }
}

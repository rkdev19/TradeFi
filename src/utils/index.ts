import algosdk, { Algodv2, modelsv2 } from 'algosdk';

// Average block time on Algorand mainnet
const BLOCK_TIME_SECONDS = 4.5;

/**
 * Converts seconds to Algorand rounds (approximately).
 * @param seconds - Number of seconds
 * @returns Equivalent number of rounds
 */
export function secondsToRounds(seconds: number): number {
  return Math.ceil(seconds / BLOCK_TIME_SECONDS);
}

/**
 * Converts Algorand rounds to seconds (approximately).
 * @param rounds - Number of rounds
 * @returns Equivalent number of seconds
 */
export function roundsToSeconds(rounds: number): number {
  return Math.ceil(rounds * BLOCK_TIME_SECONDS);
}

/**
 * Waits for a transaction to be confirmed by the network.
 * @param algodClient - Algod client instance
 * @param txId - Transaction ID
 * @param timeout - Max rounds to wait (default: 5)
 * @returns Confirmation response
 */
export async function waitForConfirmation(
  algodClient: Algodv2,
  txId: string,
  timeout: number = 5
): Promise<modelsv2.PendingTransactionResponse> {
  return algosdk.waitForConfirmation(algodClient, txId, timeout);
}

/**
 * Encodes a key string for use in global/local state lookup.
 * @param key - State key string
 * @returns Base64-encoded key
 */
export function encodeStateKey(key: string): string {
  return Buffer.from(key, 'utf8').toString('base64');
}

/**
 * Decodes a global or local state value.
 * @param stateItem - State entry from Algorand account/application
 * @returns Decoded value (string | number | null)
 */
export function decodeStateValue(
  stateItem: { value: { type: number; bytes?: string; uint?: number } } | null
): string | number | null {
  if (!stateItem) return null;

  const { type, bytes, uint } = stateItem.value;

  if (type === 1 && bytes) {
    // Bytes type (string, address, etc.)
    return Buffer.from(bytes, 'base64').toString('utf8');
  }

  if (type === 2 && typeof uint === 'number') {
    // Unsigned integer type
    return uint;
  }

  return null;
  }/**
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

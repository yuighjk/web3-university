// EIP-712 typed data signature verification utilities
import { recoverTypedDataAddress, type Address } from 'viem';

// EIP-712 domain — chain-agnostic for flexibility
const EIP712_DOMAIN = {
  name: 'Web3University',
  version: '1',
  chainId: 11155111, // Sepolia
} as const;

// Generic action type used across update-profile, post-comment, update-progress
const ACTION_TYPES = {
  Action: [
    { name: 'action', type: 'string' },
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'uint256' },
  ],
} as const;

export interface SignedRequest {
  address: string;
  timestamp: number;
  signature: `0x${string}`;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Verify an EIP-712 signed action message.
 * Returns the recovered address (lowercased) or throws on failure.
 */
export async function verifyActionSignature(
  params: SignedRequest & { action: string }
): Promise<Address> {
  const { action, address, timestamp, signature } = params;

  // Check timestamp freshness first — cheaper than crypto
  if (Date.now() - timestamp > FIVE_MINUTES_MS) {
    throw new Error('Signature expired');
  }

  const recovered = await recoverTypedDataAddress({
    domain: EIP712_DOMAIN,
    types: ACTION_TYPES,
    primaryType: 'Action',
    message: {
      action,
      address: address as Address,
      timestamp: BigInt(timestamp),
    },
    signature,
  });

  if (recovered.toLowerCase() !== address.toLowerCase()) {
    throw new Error('Signature mismatch');
  }

  return recovered;
}

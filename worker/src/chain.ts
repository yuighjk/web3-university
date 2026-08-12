// Chain interaction via viem publicClient
import { createPublicClient, http, type Address } from 'viem';
import { sepolia } from 'viem/chains';

// Minimal ABI for hasPurchased
const COURSE_MARKET_ABI = [
  {
    name: 'hasPurchased',
    type: 'function',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'courseId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

/**
 * Check on-chain whether a user has purchased a course.
 * Falls back to false on RPC errors to allow graceful degradation.
 */
export async function checkHasPurchased(
  rpcUrl: string,
  contractAddress: Address,
  userAddress: Address,
  courseId: number
): Promise<boolean> {
  try {
    const client = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    });

    const result = await client.readContract({
      address: contractAddress,
      abi: COURSE_MARKET_ABI,
      functionName: 'hasPurchased',
      args: [userAddress, BigInt(courseId)],
    });

    return result;
  } catch (err) {
    console.error('hasPurchased chain read failed:', err);
    // Fail closed — deny access when chain is unreachable
    return false;
  }
}

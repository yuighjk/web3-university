import { createWalletClient, custom, type Address } from 'viem';
import { sepolia } from 'viem/chains';

const ACTION_TYPES = {
  Action: [
    { name: 'action', type: 'string' },
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'uint256' },
  ],
} as const;

const EIP712_DOMAIN = {
  name: 'Web3University',
  version: '1',
  chainId: sepolia.id,
} as const;

interface EthereumWallet {
  address: string;
  getEthereumProvider: () => Promise<Parameters<typeof custom>[0]>;
}

/** Sign the same generic action payload verified by the Worker API. */
export async function signAction(
  wallet: EthereumWallet,
  action: string,
  timestamp: number,
): Promise<`0x${string}`> {
  const address = wallet.address as Address;
  const provider = await wallet.getEthereumProvider();
  const client = createWalletClient({
    account: address,
    chain: sepolia,
    transport: custom(provider),
  });

  return client.signTypedData({
    account: address,
    domain: EIP712_DOMAIN,
    types: ACTION_TYPES,
    primaryType: 'Action',
    message: {
      action,
      address,
      timestamp: BigInt(timestamp),
    },
  });
}

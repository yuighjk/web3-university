import { http, createConfig } from 'wagmi';
import { sepolia, hardhat } from 'wagmi/chains';

// Wagmi config for Sepolia + Hardhat local dev
// Privy handles the wallet connector injection via @privy-io/wagmi
export const wagmiConfig = createConfig({
  chains: [sepolia, hardhat],
  transports: {
    [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL || undefined),
    [hardhat.id]: http('http://127.0.0.1:8545'),
  },
});

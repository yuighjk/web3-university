// scripts/setup-pool.ts
// Uniswap V3 池创建 + 添加流动性脚本
// 使用方式: npx hardhat run scripts/setup-pool.ts --network sepolia (或 localhost)

import { network } from "hardhat";
import {
  parseUnits,
  encodeFunctionData,
  getAddress,
  type Address,
} from "viem";

// Uniswap V3 Sepolia 合约地址
const UNISWAP_V3_FACTORY = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c" as Address;
const NONFUNGIBLE_POSITION_MANAGER = "0x1238536071E1c677A632429e3655c799b22cDA52" as Address;
const SWAP_ROUTER = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as Address;

// 池子参数
const FEE = 3000; // 0.3%
const TICK_LOWER = -887220; // 全范围
const TICK_UPPER = 887220;

// ABI 片段
const factoryAbi = [
  {
    name: "createPool",
    type: "function",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    name: "getPool",
    type: "function",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
    stateMutability: "view",
  },
] as const;

const poolAbi = [
  {
    name: "initialize",
    type: "function",
    inputs: [{ name: "sqrtPriceX96", type: "uint160" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "token0",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;

const positionManagerAbi = [
  {
    name: "mint",
    type: "function",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "tokenId", type: "uint256" },
      { name: "liquidity", type: "uint128" },
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
    stateMutability: "payable",
  },
] as const;

const erc20Abi = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

/**
 * 计算 sqrtPriceX96
 * 对于 1 YD (18 dec) = 1 USDC (6 dec) 的初始价格：
 * price = token1Amount / token0Amount (按照 token0/token1 排序)
 * sqrtPriceX96 = sqrt(price) * 2^96
 */
function computeSqrtPriceX96(
  ydAddress: Address,
  usdcAddress: Address
): bigint {
  // token0 是地址更小的那个
  const ydIsToken0 = BigInt(ydAddress) < BigInt(usdcAddress);

  if (ydIsToken0) {
    // token0 = YD (18 dec), token1 = USDC (6 dec)
    // 1 YD = 1 USDC → price = 10^6 / 10^18 = 10^-12
    // sqrtPrice = sqrt(10^-12) = 10^-6
    // sqrtPriceX96 = 10^-6 * 2^96 = 2^96 / 10^6
    const twoTo96 = 2n ** 96n;
    return twoTo96 / 1_000_000n;
  } else {
    // token0 = USDC (6 dec), token1 = YD (18 dec)
    // price = 10^18 / 10^6 = 10^12
    // sqrtPrice = sqrt(10^12) = 10^6
    // sqrtPriceX96 = 10^6 * 2^96
    const twoTo96 = 2n ** 96n;
    return twoTo96 * 1_000_000n;
  }
}

async function main() {
  const connection = await network.getOrCreate();
  const viem = connection.viem;
  const [deployer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  // 读取已部署的代币地址（从环境变量或 ignition deployments）
  const YD_ADDRESS = (process.env.YD_TOKEN_ADDRESS || "") as Address;
  const USDC_ADDRESS = (process.env.MOCK_USDC_ADDRESS || "") as Address;

  if (!YD_ADDRESS || !USDC_ADDRESS) {
    console.error("请设置环境变量 YD_TOKEN_ADDRESS 和 MOCK_USDC_ADDRESS");
    console.error("可以先运行: npx hardhat ignition deploy ./ignition/modules/Tokens.ts --network localhost");
    process.exit(1);
  }

  console.log("=== Uniswap V3 Pool Setup ===");
  console.log(`YD Token: ${YD_ADDRESS}`);
  console.log(`Mock USDC: ${USDC_ADDRESS}`);
  console.log(`Deployer: ${deployer.account.address}`);

  // 确定 token0/token1 顺序
  const ydIsToken0 = BigInt(YD_ADDRESS) < BigInt(USDC_ADDRESS);
  const token0 = ydIsToken0 ? YD_ADDRESS : USDC_ADDRESS;
  const token1 = ydIsToken0 ? USDC_ADDRESS : YD_ADDRESS;
  console.log(`\nToken0: ${token0} (${ydIsToken0 ? "YD" : "USDC"})`);
  console.log(`Token1: ${token1} (${ydIsToken0 ? "USDC" : "YD"})`);

  // Step 1: 检查池子是否已存在
  console.log("\n--- Step 1: Check/Create Pool ---");
  let poolAddress = await publicClient.readContract({
    address: UNISWAP_V3_FACTORY,
    abi: factoryAbi,
    functionName: "getPool",
    args: [YD_ADDRESS, USDC_ADDRESS, FEE],
  });

  if (poolAddress === "0x0000000000000000000000000000000000000000") {
    console.log("Creating new pool...");
    const hash = await deployer.writeContract({
      address: UNISWAP_V3_FACTORY,
      abi: factoryAbi,
      functionName: "createPool",
      args: [YD_ADDRESS, USDC_ADDRESS, FEE],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Pool created. TX: ${hash}`);

    poolAddress = await publicClient.readContract({
      address: UNISWAP_V3_FACTORY,
      abi: factoryAbi,
      functionName: "getPool",
      args: [YD_ADDRESS, USDC_ADDRESS, FEE],
    });
  } else {
    console.log(`Pool already exists: ${poolAddress}`);
  }

  console.log(`Pool address: ${poolAddress}`);

  // Step 2: 初始化池子价格
  console.log("\n--- Step 2: Initialize Pool ---");
  const sqrtPriceX96 = computeSqrtPriceX96(YD_ADDRESS, USDC_ADDRESS);
  console.log(`sqrtPriceX96: ${sqrtPriceX96}`);

  try {
    const hash = await deployer.writeContract({
      address: poolAddress as Address,
      abi: poolAbi,
      functionName: "initialize",
      args: [sqrtPriceX96],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log("Pool initialized.");
  } catch (e: any) {
    if (e.message?.includes("AI") || e.message?.includes("already initialized")) {
      console.log("Pool already initialized, skipping.");
    } else {
      throw e;
    }
  }

  // Step 3: Approve tokens
  console.log("\n--- Step 3: Approve Tokens ---");
  const ydAmount = parseUnits("10000", 18);
  const usdcAmount = parseUnits("10000", 6);

  const approveYdHash = await deployer.writeContract({
    address: YD_ADDRESS,
    abi: erc20Abi,
    functionName: "approve",
    args: [NONFUNGIBLE_POSITION_MANAGER, ydAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveYdHash });

  const approveUsdcHash = await deployer.writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "approve",
    args: [NONFUNGIBLE_POSITION_MANAGER, usdcAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveUsdcHash });
  console.log("Tokens approved.");

  // Step 4: Add liquidity
  console.log("\n--- Step 4: Add Liquidity ---");
  const amount0Desired = ydIsToken0 ? ydAmount : usdcAmount;
  const amount1Desired = ydIsToken0 ? usdcAmount : ydAmount;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  const mintHash = await deployer.writeContract({
    address: NONFUNGIBLE_POSITION_MANAGER,
    abi: positionManagerAbi,
    functionName: "mint",
    args: [
      {
        token0,
        token1,
        fee: FEE,
        tickLower: TICK_LOWER,
        tickUpper: TICK_UPPER,
        amount0Desired,
        amount1Desired,
        amount0Min: 0n,
        amount1Min: 0n,
        recipient: deployer.account.address,
        deadline,
      },
    ],
  });
  const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });
  console.log(`Liquidity added. TX: ${mintHash}`);

  console.log("\n=== Setup Complete ===");
  console.log(`Pool: ${poolAddress}`);
  console.log(`SwapRouter: ${SWAP_ROUTER}`);
  console.log("Ready for USDC → YD swaps!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

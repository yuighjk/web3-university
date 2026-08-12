# 4. Uniswap V3 Pool — 开发规格

## 概述

创建 YD/USDC Uniswap V3 交易池，添加初始流动性，前端实现 USDC → YD 兑换。

## 池子参数

| 参数 | 值 |
|------|-----|
| tokenA | YDToken (18 decimals) |
| tokenB | MockUSDC (6 decimals) |
| fee | 3000 (0.3%) |
| 初始价格 | 1 YD ≈ 1 USDC（参考价，由 AMM 浮动） |
| 初始流动性 | 10,000 YD + 10,000 USDC |
| tick 范围 | 全范围（-887220 ~ 887220） |

## 价格计算（关键）

Uniswap V3 用 sqrtPriceX96 表示价格：
```
sqrtPriceX96 = sqrt(price) * 2^96
price = token1 / token0 (按地址排序)
```

YD (18 decimals) vs USDC (6 decimals)，1:1 的真实价格：
```
price = (1 * 10^6) / (1 * 10^18) = 10^-12
sqrtPriceX96 = sqrt(10^-12) * 2^96 = 10^-6 * 2^96
```

**注意**：token0/token1 由地址大小决定（小地址 = token0），部署时必须动态判断。

## 部署脚本（非 Ignition，用 Hardhat script）

```typescript
// scripts/setup-pool.ts
// 1. 获取 Uniswap V3 Factory 和 NonfungiblePositionManager 地址（Sepolia）
// 2. 调用 factory.createPool(tokenA, tokenB, fee)
// 3. 调用 pool.initialize(sqrtPriceX96)
// 4. approve tokenA + tokenB 给 PositionManager
// 5. 调用 PositionManager.mint() 添加流动性
```

## Sepolia 上的 Uniswap V3 合约地址

```
Factory: 0x0227628f3F023bb0B980b67D528571c95c6DaC1c
SwapRouter: 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E
NonfungiblePositionManager: 0x1238536071E1c677A632429e3655c799b22cDA52
```

## 前端兑换流程

```typescript
// 1. 用户输入 USDC 数量
// 2. 获取报价（可选：用 Quoter 合约预估）
// 3. approve USDC 给 SwapRouter
//    await writeContractAsync({ functionName: 'approve', args: [routerAddress, amount] })
//    await waitForTransactionReceipt({ hash: approveHash })
// 4. 调用 SwapRouter.exactInputSingle
//    {
//      tokenIn: USDC_ADDRESS,
//      tokenOut: YD_ADDRESS,
//      fee: 3000,
//      recipient: userAddress,
//      amountIn: usdcAmount,
//      amountOutMinimum: expectedYD * 95n / 100n,  // 5% 滑点保护
//      sqrtPriceLimitX96: 0n
//    }
// 5. 等待确认 → 刷新余额
```

## 测试用例

1. 池子创建成功
2. 初始化价格正确
3. 添加流动性成功
4. USDC → YD swap 成功
5. swap 后余额变化正确
6. 滑点保护生效（amountOutMinimum 过高则 revert）

## 验收标准

- [ ] Sepolia 上创建 YD/USDC 池
- [ ] 池中有 10,000 YD + 10,000 USDC 流动性
- [ ] 前端可以用 USDC 兑换 YD
- [ ] 兑换有滑点保护

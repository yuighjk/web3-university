# Web3 University

## 项目概述

Web3 教育平台 DApp —— 中心化应用 + 链上资产混合架构。课程内容存链下，购买/证书/代币在链上。

## 技术栈

- **前端**: React 19 + Vite + Ant Design 5 + Privy 钱包登录
- **后端**: Cloudflare Workers + Hono + D1 (SQLite)
- **合约**: Solidity 0.8.28 + Hardhat 3 + OpenZeppelin
- **链**: Ethereum Sepolia (chainId: 11155111)
- **代币**: ERC-20 (YDToken + MockUSDC) + Uniswap V3
- **证书**: ERC-721 Soulbound Token

## 目录结构

```
web3-university/
├── contracts/              # Solidity 合约
├── test/                   # 合约测试 (node:test)
├── ignition/modules/       # Hardhat Ignition 部署
├── scripts/                # 部署脚本 (Uniswap pool setup)
├── frontend/               # React 前端
│   └── src/
│       ├── components/     # UI 组件
│       ├── contracts/      # ABI + 地址配置
│       ├── hooks/          # 自定义 hooks
│       └── pages/          # 页面组件
├── worker/                 # Cloudflare Workers 后端
│   ├── src/                # API 路由
│   └── migrations/         # D1 数据库 migration
├── docs/                   # 需求文档
└── specs/                  # 开发规格 (PRD 生成)
```

## 常用命令

```bash
# 合约
npx hardhat compile                    # 编译合约
npx hardhat test                       # 运行测试
npx hardhat ignition deploy ./ignition/modules/Tokens.ts --network sepolia --verify

# 前端
cd frontend && npm run dev             # 启动开发服务器
cd frontend && npm run build           # 生产构建

# 后端
cd worker && npx wrangler dev          # 本地开发
cd worker && npx wrangler deploy       # 部署到 Cloudflare
cd worker && npx wrangler d1 migrations apply DB --local  # 执行 migration
```

## 合约地址 (Sepolia)

- YDToken: `0xe02Df92AFa6238a609F26FBe5b01676791C6377a`
- MockUSDC: `0x4EFa7bE027290088B0F1d5Ad4D4387dF7FB5d00C`
- CourseMarket: `0x6Fc7a078C8d18CF9b339c4509926D9d9eAd5ed61`
- CourseCertificate: `0x0Ac1a6a094916a72508607B17e878dC2EFe4FD13`
- Uniswap V3 Pool (YD/USDC): `0xd4711de43a354B20EE2DAD8D7DBF99e57B7B0213`
- Uniswap V3 SwapRouter: `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E`

## 环境变量

根目录 `.env`: SEPOLIA_RPC_URL, SEPOLIA_PRIVATE_KEY, ETHERSCAN_API_KEY
前端 `.env`: VITE_PRIVY_APP_ID, VITE_xxx_ADDRESS (各合约地址)
Worker `.env`: 通过 wrangler secret 管理

## 规则引入

@rules/coding-style.md
@rules/testing.md
@rules/security.md
@rules/git-workflow.md
@rules/frontend.md
@rules/backend-api.md
@rules/smart-contracts.md
@rules/database.md

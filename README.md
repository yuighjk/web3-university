# 🎓 Web3 大学

中心化应用 + 链上资产的 Web3 教育平台。课程内容存链下数据库，购买/证书/代币在链上，实现"内容可管理、资产不可篡改"的混合架构。

## 在线体验

- 前端：https://web3-university-6t4.pages.dev/
- 后端：https://web3-university-worker.yyyio3184027.workers.dev/
- 合约验证：https://eth-sepolia.blockscout.com/address/0x6Fc7a078C8d18CF9b339c4509926D9d9eAd5ed61#code

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 19 + Vite + Ant Design 5 + TypeScript |
| 钱包登录 | Privy (支持 Wallet / Email / Google) |
| Web3 交互 | wagmi + viem |
| 代币兑换 | Uniswap V3 (USDC → YD) |
| 后端 | Cloudflare Workers + Hono + D1 (SQLite) |
| 合约 | Solidity 0.8.28 + Hardhat 3 + OpenZeppelin |
| 证书 | ERC-721 Soulbound Token (不可转让) |
| 测试网 | Ethereum Sepolia (chainId: 11155111) |

## 合约地址 (Sepolia)

| 合约 | 地址 |
|------|------|
| YDToken (ERC-20) | `0xe02Df92AFa6238a609F26FBe5b01676791C6377a` |
| MockUSDC (ERC-20, 6 dec) | `0x4EFa7bE027290088B0F1d5Ad4D4387dF7FB5d00C` |
| CourseMarket | `0x6Fc7a078C8d18CF9b339c4509926D9d9eAd5ed61` |
| CourseCertificate (SBT) | `0x0Ac1a6a094916a72508607B17e878dC2EFe4FD13` |
| Uniswap V3 Pool (YD/USDC) | `0xd4711de43a354B20EE2DAD8D7DBF99e57B7B0213` |

## 功能概览

### 用户侧
- 🔐 Privy 登录（钱包 / Google / Email）
- 📚 浏览课程列表（链上 + 链下混合数据）
- 💰 USDC → YD 代币兑换（Uniswap V3）
- 🛒 用 YD 购买课程（approve → buy 严格串行）
- 🎬 购买后观看视频（后端验证链上购买状态）
- 🏆 完成课程获得 SBT 毕业证书（不可转让）
- 👤 个人中心（余额、已购课程、证书）

### 管理侧 (Owner)
- 👨‍🏫 授权老师/商家 (setProvider)
- 📝 审批上架课程 (publishCourse)
- 🎓 给完成学习的学生发证书 (issueCertificate)

## 项目结构

```
web3-university/
├── contracts/                # Solidity 智能合约
│   ├── YDToken.sol           # ERC-20 平台代币 (100万 YD)
│   ├── MockUSDC.sol          # 测试 USDC (6 decimals + faucet)
│   ├── CourseMarket.sol      # 课程市场 (上架/购买/查询)
│   └── CourseCertificate.sol # SBT 证书 (ERC-721 不可转让)
├── test/                     # 合约测试 (31 passing)
├── ignition/modules/         # Hardhat Ignition 部署
├── scripts/                  # Uniswap V3 池创建脚本
├── frontend/                 # React 前端
│   └── src/
│       ├── pages/            # 5 个页面
│       ├── hooks/            # useBuyCourse 等
│       ├── contracts/        # ABI + 地址
│       └── components/       # Layout + 导航
├── worker/                   # Cloudflare Workers 后端
│   └── src/
│       ├── routes/           # API 路由
│       ├── auth.ts           # EIP-712 签名验证
│       └── chain.ts          # 链上读取
├── docs/                     # PRD 需求文档
└── specs/                    # 开发规格 (7 features)
```

## 快速开始

### 前置条件

- Node.js >= 18
- MetaMask 浏览器插件
- Sepolia 测试 ETH（[水龙头](https://www.alchemy.com/faucets/ethereum-sepolia)）

### 安装

```bash
git clone https://github.com/yuighjk/web3-university.git
cd web3-university

# 安装合约依赖
npm install

# 安装前端依赖
cd frontend && npm install && cd ..

# 安装后端依赖
cd worker && npm install && cd ..
```

### 运行合约测试

```bash
npx hardhat test
# 31 passing
```

### 本地开发

```bash
# 终端 1: 启动本地链
npx hardhat node

# 终端 2: 部署合约到本地
npx hardhat ignition deploy ./ignition/modules/AllContracts.ts --network localhost

# 终端 3: 启动前端
cd frontend && npm run dev

# 终端 4: 启动 Worker 后端：
cd worker && npm run dev
```

### 部署到 Sepolia

```bash
# 1. 配置环境变量
cp .env.example .env
# 填写 SEPOLIA_PRIVATE_KEY 和 ETHERSCAN_API_KEY

# 2. 部署合约 + 验证
npx hardhat ignition deploy ./ignition/modules/AllContracts.ts --network sepolia --verify

# 3. 创建 Uniswap V3 池 + 添加流动性
YD_TOKEN_ADDRESS=0x... MOCK_USDC_ADDRESS=0x... npx hardhat run scripts/setup-pool.ts --network sepolia
```

### 部署后端

```bash
cd worker

# 创建 D1 数据库
npx wrangler d1 create web3-university-db
# 将输出的 database_id 更新到 wrangler.toml

# 执行 migration
npx wrangler d1 migrations apply web3-university-db --local

# 设置 secrets
npx wrangler secret put COURSE_MARKET_ADDRESS
npx wrangler secret put SEPOLIA_RPC_URL

# 部署
npx wrangler deploy
```

## 架构设计

```
┌─────────────────────────────────────────────────┐
│              用户浏览器                            │
│   Privy 登录 → React 前端 → wagmi/viem           │
└────────┬──────────────┬─────────────────────────┘
         │              │
         ▼              ▼
┌─────────────┐  ┌──────────────────────────────┐
│ 后端 API    │  │    Ethereum Sepolia           │
│ (Workers)   │  │                              │
│             │  │  YDToken ←→ Uniswap Pool     │
│ 课程详情    │  │  CourseMarket (购买/上架)      │
│ 视频权限    │  │  CourseCertificate (SBT)     │
│ 评论/进度   │  │                              │
│ 用户资料    │  │  ← 后端调 hasPurchased 验权 → │
└─────────────┘  └──────────────────────────────┘
```

### 链上 vs 链下

| 数据 | 存储位置 | 原因 |
|------|---------|------|
| 课程 ID / 价格 / 购买记录 | 链上 | 不可篡改，作为权威数据源 |
| 视频 / 评论 / 学习进度 | D1 数据库 | 内容频繁变更，Gas 成本高 |
| 用户头像 / 用户名 | D1 数据库 | 非金融数据，无需上链 |
| 证书 NFT | 链上 | 不可伪造，永久有效 |
| 代币余额 / 兑换 | 链上 | DeFi 标准 |

### 安全设计

- 购买流程严格串行：check allowance → approve (wait receipt) → buy (wait receipt)
- 视频权限：后端调链上 `hasPurchased()` 验证后才返回签名 URL
- 用户资料修改：EIP-712 签名 + 5 分钟过期
- SBT 证书：重写 `_update()` 禁止转让
- contentHash：前端重算 keccak256 与链上比对，检测篡改

## 注意事项

⚠️ **链上数据完全公开**，不具备隐私性。每个地址的购买记录和笔记内容任何人都可以查询。

⚠️ **YD/USDC 价格非固定**。初始按 1:1 建池，后续价格由 Uniswap AMM 机制决定。

⚠️ **本项目部署在 Sepolia 测试网**，所有代币无真实价值。

## 相关资源

- [Hardhat 3 文档](https://hardhat.org/docs)
- [wagmi 文档](https://wagmi.sh)
- [Privy 文档](https://docs.privy.io/)
- [Uniswap V3 开发者文档](https://docs.uniswap.org/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)

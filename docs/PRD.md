# Web3 大学 — 产品需求文档 (PRD)

## 项目概述

中心化应用 + 链上资产的 Web3 教育平台。课程内容存链下数据库，购买/证书/代币在链上，实现"内容可管理、资产不可篡改"的混合架构。

**技术栈：**
- 前端：React 19 + Vite + Ant Design + Privy 钱包登录
- 后端：Cloudflare Workers + D1 数据库
- 合约：Solidity 0.8.28 + Hardhat 3 + Sepolia 测试网
- 代币兑换：Uniswap V3
- 证书：ERC-721 Soulbound Token

---

## 功能模块

### 模块 1：课程列表（链上 + 链下混合）

**链上数据（CourseMarket 合约）：**
- courseId（uint256，唯一标识）
- provider（address，上架老师/商家）
- contentHash（bytes32，keccak256(标题+描述+视频文件hash+封面hash)）
- metadataURI（string，后端 API 地址）
- certificateName（string，证书名称）
- price（uint256，课程价格，单位 YD）
- active（bool，是否上架）

**链下数据（D1 数据库）：**
- 课程标题、描述、封面图 URL
- 视频列表（签名 URL，购买后才可访问）
- 评论列表
- 学习进度
- 上架状态（与链上同步）

**课程发现流程：**
```
合约提供 getAllCourseIds() 返回所有课程 ID 数组
    ↓
前端 multicall 批量调用 getCourse(id)
    ↓
只展示 active === true 的课程
    ↓
点击课程 → 从后端 API 拿详情（视频、评论）
```

**防篡改校验：**
- 前端获取课程详情后，对（标题+描述+视频文件hash+封面hash）重新计算 keccak256
- 与合约 contentHash 比对，不一致则提示"内容已被篡改"
- 不要把签名 URL、评论等动态内容纳入 hash

**视频权限控制：**
- 后端返回视频签名 URL 前，调用合约 `hasPurchased(msg.sender, courseId)` 验证
- 未购买用户只能看到课程介绍，不能获取视频

---

### 模块 2：课程上架（Owner 审批）

**角色：**
- Owner：合约部署者，唯一管理员
- Teacher：被 Owner 授权的老师
- Merchant：被 Owner 授权的商家

**流程：**
```
老师/商家提交课程 → 后端存草稿（status: pending）
    ↓
Owner 审批通过
    ↓
后端计算 contentHash = keccak256(标题+描述+视频hash+封面hash)
    ↓
Owner 调用合约 publishCourse(courseId, provider, metadataURI, contentHash, certName, price)
    ↓
交易确认后，后端标记 status: published
```

**合约接口：**
```solidity
enum ProviderType { None, Teacher, Merchant }

function setProvider(address provider, ProviderType pType) external onlyOwner;
function publishCourse(uint256 courseId, address provider, string metadataURI, bytes32 contentHash, string certificateName, uint256 price) external onlyOwner;
function delistCourse(uint256 courseId) external onlyOwner;
```

---

### 模块 3：发行 ERC-20 YD 币

**合约：YDToken.sol**
```solidity
// 标准 ERC20
name: "YiDeng Token"
symbol: "YD"
decimals: 18
totalSupply: 1,000,000 YD（部署时全部 mint 给 deployer）
```

**MockUSDC.sol（测试用）：**
```solidity
name: "Mock USDC"
symbol: "USDC"
decimals: 6  // 必须与真实 USDC 一致
// 带 faucet 函数，测试时可免费领取
function faucet(uint256 amount) external;
```

---

### 模块 4：Uniswap V3 交易池

**池子配置：**
- 交易对：YD / MockUSDC
- 初始价格：1 YD = 1 USDC（参考价格，后续由 AMM 决定）
- 手续费：0.3%（3000）
- 初始流动性：10,000 YD + 10,000 USDC

**注意事项：**
- YD 是 18 位小数，USDC 是 6 位小数，初始化 sqrtPriceX96 时必须处理差异
- 必须确认 token0/token1 顺序（地址排序决定）
- 前端兑换时必须设置 amountOutMinimum（防滑点）和 deadline

**前端兑换流程：**
```
用户输入 USDC 数量
    ↓
approve USDC 给 SwapRouter
    ↓ 等待 approve 确认
调用 SwapRouter.exactInputSingle({
  tokenIn: USDC,
  tokenOut: YD,
  fee: 3000,
  recipient: user,
  amountIn: amount,
  amountOutMinimum: 预估量 * 0.95,  // 5% 滑点保护
  sqrtPriceLimitX96: 0
})
    ↓
等待交易确认 → 刷新余额
```

**ETH → YD：**
- 本作业不实现直接 ETH → YD 兑换
- 前端提示用户先在 Uniswap 官网将 ETH 换成 USDC，再用 USDC 换 YD
- 或后续扩展建立 WETH/YD 池

---

### 模块 5：购买课程

**合约接口：**
```solidity
uint256 public constant COURSE_PRICE = 4 * 10**18; // 4 YD（可改为每课程独立定价）

function buyCourse(uint256 courseId) external;
function hasPurchased(address user, uint256 courseId) external view returns (bool);
function getPurchasedCourses(address user) external view returns (uint256[] memory);
```

**购买流程（前端时序，严格串行）：**
```typescript
// 1. 读取课程价格
const price = await readContract({ functionName: 'courses', args: [courseId] }).price;

// 2. 检查当前 allowance
const allowance = await readContract({
  address: ydTokenAddress,
  functionName: 'allowance',
  args: [userAddress, courseMarketAddress]
});

// 3. 如果 allowance 不足，先 approve
if (allowance < price) {
  const approveHash = await writeContractAsync({
    address: ydTokenAddress,
    functionName: 'approve',
    args: [courseMarketAddress, price]
  });
  await waitForTransactionReceipt({ hash: approveHash });
}

// 4. approve 确认后，再调用 buyCourse
const buyHash = await writeContractAsync({
  address: courseMarketAddress,
  functionName: 'buyCourse',
  args: [courseId]
});
await waitForTransactionReceipt({ hash: buyHash });

// 5. 刷新购买状态
refetch();
```

**防重复购买：**
```solidity
mapping(address => mapping(uint256 => bool)) public purchased;
require(!purchased[msg.sender][courseId], "Already purchased");
```

---

### 模块 6：毕业证书（ERC-721 Soulbound Token）

**合约：CourseCertificate.sol**

```solidity
// Soulbound NFT — 不可转让
function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
    address from = _ownerOf(tokenId);
    require(from == address(0), "Soulbound: non-transferable");
    return super._update(to, tokenId, auth);
}

// 发证接口
function issueCertificate(address student, uint256 courseId, string tokenURI) external onlyOwner;
```

**Chainlink 预言机替代方案（mockFulfill）：**

由于 Chainlink CRE 目前不可用，采用 Owner 手动发证：
```
学生完成课程（后端记录学习进度 100%）
    ↓
学生在前端点击"申请证书"
    ↓
后端验证学习进度已完成
    ↓
Owner（或后端自动化脚本）调用 issueCertificate(student, courseId, tokenURI)
    ↓
NFT mint 到学生地址，不可转让
```

**tokenURI 内容（JSON metadata）：**
```json
{
  "name": "Web3 开发入门 — 毕业证书",
  "description": "完成课程学习并通过考核",
  "image": "ipfs://...",
  "attributes": [
    { "trait_type": "Course", "value": "Web3 开发入门" },
    { "trait_type": "Student", "value": "0x..." },
    { "trait_type": "Issue Date", "value": "2026-08-11" }
  ]
}
```

---

### 模块 7：个人中心（Privy 钱包登录）

**Privy 集成：**
- 支持 Google / Email / 钱包 多种登录方式
- 登录后自动生成或关联 EVM 地址
- 前端用 `@privy-io/react-auth` SDK

**用户资料：**
- 存储位置：D1 数据库（链下）
- 字段：用户名、头像 URL、绑定的钱包地址
- 修改流程：
  ```
  用户编辑资料 → 钱包签名消息（EIP-712）
      ↓
  后端 ecrecover 验证签名 === 用户地址
      ↓
  更新数据库
  ```

**个人中心展示：**
- 钱包地址 + ENS（如有）
- YD 余额
- 已购课程列表（调合约 getPurchasedCourses）
- 已获得证书（查询 NFT）
- 学习进度（后端 API）

---

## 合约部署清单

| 合约 | 说明 |
|------|------|
| YDToken.sol | ERC-20 代币 |
| MockUSDC.sol | 测试 USDC（6 decimals + faucet） |
| CourseMarket.sol | 课程市场（上架、购买、查询） |
| CourseCertificate.sol | SBT 毕业证书（ERC-721 不可转让） |

部署顺序：
1. YDToken → 2. MockUSDC → 3. 创建 Uniswap V3 池并添加流动性 → 4. CourseMarket(ydToken地址) → 5. CourseCertificate

---

## 页面路由

| 路由 | 页面 | 说明 |
|------|------|------|
| / | 首页 | 课程列表 |
| /course/:id | 课程详情 | 介绍 + 购买 + 视频（已购才可看） |
| /swap | 兑换 | USDC → YD 兑换 |
| /profile | 个人中心 | 资料、余额、已购课程、证书 |
| /admin | 管理后台 | Owner 审批课程、授权老师、发证书 |

---

## 技术约束

1. 测试网：Ethereum Sepolia（chainId: 11155111）
2. 前端打包后部署到 IPFS 或 Vercel
3. 后端 Cloudflare Workers + D1（边缘计算，免费额度足够作业）
4. 合约在 Etherscan 开源验证
5. Privy 免费 Plan 足够作业使用

---

## 验收标准

- [ ] 合约全部部署到 Sepolia 并在 Etherscan 验证
- [ ] 课程列表从合约 + 后端混合读取展示
- [ ] Owner 可以授权老师、上架课程
- [ ] 用户用 USDC 兑换 YD（Uniswap V3）
- [ ] 用户用 YD 购买课程（approve → buy 严格串行）
- [ ] 购买后可观看视频（后端验证链上购买状态）
- [ ] Owner 可给完成课程的学生发 SBT 证书
- [ ] 证书不可转让（transfer 会 revert）
- [ ] Privy 登录 + 个人中心展示
- [ ] 前端 contentHash 校验展示

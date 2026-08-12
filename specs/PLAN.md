# PLAN.md — Web3 大学需求切分索引

## 项目信息

- **PROJECT_NAME**: web3-university
- **ARCH_TYPE**: Web3 全栈（前端 + 后端 API + 智能合约 + Uniswap 集成）
- **测试网**: Ethereum Sepolia (chainId: 11155111)

---

## 📐 需求切分方案（共 7 个 feature）

| # | feature 名称 (kebab-case) | 包含的功能需求 | 预估任务数 | 依赖的 feature |
|---|---------------------------|---------------|-----------|---------------|
| 1 | token-contracts | YDToken ERC20 + MockUSDC + 部署脚本 + 测试 | 5 | - |
| 2 | course-market-contract | CourseMarket 合约（上架/购买/查询） + 测试 | 7 | 1 |
| 3 | certificate-contract | CourseCertificate SBT ERC721 + mockFulfill + 测试 | 5 | 2 |
| 4 | uniswap-pool | Uniswap V3 池创建 + 流动性添加 + 前端兑换组件 | 6 | 1 |
| 5 | backend-api | Cloudflare Workers + D1 数据库 + 课程 CRUD + 视频权限 | 7 | 2 |
| 6 | frontend-core | React 项目搭建 + Privy 登录 + 课程列表 + 购买流程 + 个人中心 | 8 | 1, 2, 4, 5 |
| 7 | admin-panel | Owner 管理后台（授权老师、审批课程、发证书） | 5 | 2, 3, 5 |

---

## feature 依赖图

```
1.token-contracts
    ├──→ 2.course-market-contract
    │        ├──→ 3.certificate-contract
    │        ├──→ 5.backend-api
    │        └──→ 7.admin-panel
    └──→ 4.uniswap-pool
              └──→ 6.frontend-core ←── 5.backend-api
```

---

## 执行顺序建议

```
Phase 1 (并行): 1.token-contracts
Phase 2 (并行): 2.course-market-contract + 4.uniswap-pool
Phase 3 (并行): 3.certificate-contract + 5.backend-api
Phase 4 (并行): 6.frontend-core + 7.admin-panel
```

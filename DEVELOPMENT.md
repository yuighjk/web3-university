# 开发指南

## 如何启动项目

### 1. 启动 Worker 后端（API 服务器）

```bash
cd worker
npm install
npm run dev
```

Worker 会运行在 `http://127.0.0.1:8787`

### 2. 启动前端

在另一个终端窗口：

```bash
cd frontend
npm install
npm run dev
```

前端会运行在 `http://localhost:5173`

### 3. 环境变量配置

**前端 `.env` 文件** (`frontend/.env`)：
- `VITE_API_BASE_URL=http://127.0.0.1:8787` — Worker 本地开发服务器地址
- 其他变量包含智能合约地址和 Privy App ID

**后端配置** (`worker/wrangler.toml`)：
- 数据库绑定和环境变量配置
- 本地开发端口：8787

## API 端点

Worker 提供以下 API：

- `GET /api/users/:address` - 获取用户信息
- `POST /api/users` - 创建/更新用户
- `POST /api/creators` - 申请成为讲师
- `GET /api/faucet/status/:address` - 检查水龙头领取状态
- `POST /api/faucet/claim` - 领取测试代币

## 常见问题

### Q: 前端显示 502 错误
**A**: 确保 Worker 后端已经启动（`cd worker && npm run dev`）

### Q: 数据库错误
**A**: Worker 使用 Cloudflare D1 数据库，需要先运行迁移：
```bash
cd worker
wrangler d1 migrations apply web3-university --local
```

### Q: 签名后一直 loading
**A**: 已修复 — 确保使用最新代码（错误处理逻辑已改进）

## 生产部署

### 部署 Worker

```bash
cd worker
npm run deploy
```

部署后会得到一个 Cloudflare Workers URL，例如：
`https://web3-university-worker.your-subdomain.workers.dev`

然后更新 `frontend/.env`：
```
VITE_API_BASE_URL=https://web3-university-worker.your-subdomain.workers.dev
```

### 部署前端

前端可以部署到 Vercel、Netlify 或任何静态托管服务。

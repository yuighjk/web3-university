# Testing

## 合约测试

- 框架：Hardhat 3 内置 node:test + assert
- 通过 `network.getOrCreate()` 获取 viem helpers
- 每个合约至少覆盖：正常路径 + revert 路径 + 事件验证
- 测试文件位于 `test/` 目录，与合约同名

## 前端测试

- 暂不强制单元测试
- 以端到端手动测试为主（连接钱包 → 完整流程）
- 关键 hooks 可用 vitest 测试

## 测试命令

```bash
npx hardhat test           # 合约测试
cd frontend && npm test    # 前端测试（如有）
```

## 测试规范

- 每个 describe 块用 beforeEach 重新部署合约（隔离状态）
- 测试名称用中文或英文均可，描述清楚测试意图
- revert 测试使用 assert.rejects + 检查错误消息

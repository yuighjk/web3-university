# Security

## 绝对禁止

- 不要把私钥、助记词写入代码或提交到 git
- 不要把 .env 文件提交到 git
- 不要在前端代码（VITE_ 变量）中放任何敏感信息
- 不要使用持有真实资产的钱包进行测试

## 合约安全

- 所有外部输入必须 require 校验
- 使用 OpenZeppelin 库，不要自己实现基础功能
- transferFrom 前必须检查 allowance 或在 require 中处理失败
- 避免重入攻击：状态修改在外部调用之前（CEI 模式）
- Owner 权限函数必须用 onlyOwner 修饰符

## 前端安全

- 合约地址通过环境变量注入
- 用户输入必须校验/转义
- 签名消息必须包含时间戳，后端验证过期

## 密钥管理

- 根目录 .env：仅限部署用私钥（测试钱包）
- Worker secrets：通过 `wrangler secret put` 管理
- 前端：只有 VITE_ 前缀变量，全部是公开信息（合约地址、RPC URL）

# Smart Contracts Rules

paths: contracts/**

## 框架

- Solidity 0.8.28
- Hardhat 3
- OpenZeppelin Contracts v5
- 部署：Hardhat Ignition
- 验证：Etherscan (Sepolia)

## 编码规范

- 遵循 Solidity Style Guide
- 使用 NatSpec 注释（@notice, @param, @return）
- 状态变量顺序：constant → immutable → storage
- 函数顺序：external → public → internal → private
- 使用 custom errors 或 require + 字符串（本项目用 require）

## 安全模式

- CEI (Checks-Effects-Interactions) 模式
- 权限控制用 OpenZeppelin Ownable
- ERC20 操作用 SafeERC20（如需要）
- 所有外部输入必须校验

## 事件

- 每个状态变更操作必须 emit 事件
- 事件参数中地址字段 indexed

## 测试

- 每个合约一个测试文件
- 正常路径 + 所有 revert 路径 + 事件验证
- 使用 beforeEach 隔离状态

## Gas 优化（本项目不强求）

- 作业项目不需要极致优化
- 但避免明显浪费（如循环中重复读 storage）

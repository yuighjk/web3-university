# Frontend Rules

paths: frontend/**

## 框架

- React 19 + Vite
- UI 库：Ant Design 5
- 路由：React Router v6
- 状态/请求：TanStack Query
- Web3：wagmi + viem
- 钱包登录：@privy-io/react-auth

## 组件规范

- 函数组件 + hooks
- 一个文件一个组件
- Props 用 interface 定义
- 避免 any，必要时用 unknown

## 合约交互规范

- 写操作必须用 writeContractAsync（需要等待 hash）
- approve + 业务操作必须串行（等 receipt 后再发下一笔）
- 读操作用 useReadContract
- 交易状态用 useWaitForTransactionReceipt
- 合约地址/ABI 统一放 `src/contracts/` 目录

## 样式

- 优先使用 Ant Design 组件自带样式
- 自定义样式用 CSS Modules 或内联 style
- 响应式：移动端优先

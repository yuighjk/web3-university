# Git Workflow

## 分支

- main：稳定分支，合并后的代码
- feat/xxx：功能分支
- fix/xxx：修复分支

## Commit 规范

格式：`type: brief description`

类型：
- feat: 新功能
- fix: 修复
- refactor: 重构
- test: 测试
- docs: 文档
- chore: 杂项（依赖更新等）

示例：
```
feat: implement CourseMarket buy logic
fix: correct USDC decimals in swap calculation
test: add soulbound transfer rejection tests
```

## PR

- 标题简洁，< 70 字符
- body 包含 Summary + Test plan
- 合约改动必须附测试结果

## .gitignore 必须包含

```
node_modules/
.env
dist/
cache/
artifacts/
ignition/deployments/
.wrangler/
```

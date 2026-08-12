# Coding Style

## 通用

- 语言：TypeScript (strict mode)
- 缩进：2 spaces
- 引号：单引号
- 分号：必须
- 行尾：LF
- 最大行宽：100 字符

## 命名

- 变量/函数：camelCase
- 类/接口/类型：PascalCase
- 常量：UPPER_SNAKE_CASE
- 文件名：kebab-case（组件文件 PascalCase）
- 合约名：PascalCase
- 合约事件：PascalCase
- 合约函数：camelCase

## Import 顺序

1. Node/external 模块
2. 框架模块 (react, viem, wagmi)
3. 项目内部模块
4. 类型导入 (type imports 最后)

各组之间空一行。

## 注释

- 复杂逻辑必须注释
- 合约函数必须 NatSpec 注释
- 不写废话注释（`// 设置变量` 这种不要）
- TODO 格式：`// TODO(author): description`

# Backend API Rules

paths: worker/**

## 框架

- 运行时：Cloudflare Workers
- 路由框架：Hono
- 数据库：Cloudflare D1 (SQLite)
- 链上读取：viem (publicClient)

## API 设计

- RESTful 风格
- 响应格式：`{ data: T }` 或 `{ error: string }`
- HTTP 状态码规范使用（200/201/400/401/403/404/500）
- 路径前缀：`/api/`

## 鉴权

- 公开接口：GET 课程列表、课程详情、用户资料
- 需验证接口：修改资料、发评论、获取视频
- 验证方式：EIP-712 签名 + 时间戳过期检查（5分钟）
- 视频权限：后端调链上 hasPurchased() 验证

## 数据库

- Migration 文件放 `worker/migrations/`
- 表名：小写 + 下划线
- 时间字段：DATETIME DEFAULT CURRENT_TIMESTAMP
- 外键：显式声明

## 错误处理

- 统一错误响应格式
- 不暴露内部错误细节给前端
- 链上调用失败优雅降级

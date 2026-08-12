# Database Rules

paths: worker/migrations/**

## 数据库

- 类型：Cloudflare D1 (SQLite)
- ORM：无（直接 SQL via D1 binding）

## 表设计

- 主键：`id INTEGER PRIMARY KEY` 或自然键（address）
- 时间戳：`created_at DATETIME DEFAULT CURRENT_TIMESTAMP`
- 状态字段：TEXT 类型，枚举值用约定（pending/published/delisted）
- 外键：显式 FOREIGN KEY 声明

## Migration

- 文件位于 `worker/migrations/`
- 命名：`0001_create_tables.sql`、`0002_add_index.sql`
- 每个 migration 幂等或有明确的 up 逻辑
- 执行：`npx wrangler d1 migrations apply DB --local`

## 查询规范

- 参数化查询（防 SQL 注入）
- 分页：LIMIT + OFFSET
- 索引：course_id、user_address 等高频查询字段

## 与链上数据的关系

- D1 存储链下详情（视频、评论、进度）
- 链上是权威数据源（购买状态、课程 active 状态）
- D1 status 字段只在链上交易确认后更新
- 不要出现 D1 有但链上没有的"脏数据"

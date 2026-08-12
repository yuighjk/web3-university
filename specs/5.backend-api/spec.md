# 5. Backend API — 开发规格

## 概述

Cloudflare Workers + D1 数据库，提供课程详情、视频权限控制、用户资料、学习进度等链下服务。

## 技术栈

- 运行时：Cloudflare Workers
- 数据库：Cloudflare D1 (SQLite)
- 框架：Hono（轻量 Workers 框架）
- 链上验证：viem（读合约 hasPurchased）

## 数据库 Schema

```sql
-- 课程表
CREATE TABLE courses (
  id INTEGER PRIMARY KEY,
  course_id INTEGER UNIQUE NOT NULL,        -- 与链上 courseId 一致
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  cover_url TEXT NOT NULL,
  video_urls TEXT NOT NULL,                  -- JSON array
  content_hash TEXT NOT NULL,               -- keccak256，与链上一致
  status TEXT DEFAULT 'pending',            -- pending / published / delisted
  provider_address TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 评论表
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  user_address TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES courses(course_id)
);

-- 用户资料表
CREATE TABLE users (
  address TEXT PRIMARY KEY,
  username TEXT,
  avatar_url TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 学习进度表
CREATE TABLE progress (
  user_address TEXT NOT NULL,
  course_id INTEGER NOT NULL,
  progress INTEGER DEFAULT 0,               -- 0-100
  completed_at DATETIME,
  PRIMARY KEY (user_address, course_id)
);
```

## API 路由

### 课程相关

| Method | Path | 说明 | 鉴权 |
|--------|------|------|------|
| GET | /api/courses | 课程列表（基本信息） | 无 |
| GET | /api/courses/:id | 课程详情（不含视频） | 无 |
| GET | /api/courses/:id/videos | 课程视频（签名URL） | 验证链上购买 |
| POST | /api/courses | 提交课程草稿 | 签名验证 + provider |
| PATCH | /api/courses/:id/status | 更新状态 | Owner 签名 |

### 评论相关

| Method | Path | 说明 | 鉴权 |
|--------|------|------|------|
| GET | /api/courses/:id/comments | 获取评论列表 | 无 |
| POST | /api/courses/:id/comments | 发表评论 | 签名验证 + 已购买 |

### 用户相关

| Method | Path | 说明 | 鉴权 |
|--------|------|------|------|
| GET | /api/users/:address | 获取用户资料 | 无 |
| PUT | /api/users/:address | 修改用户资料 | EIP-712 签名验证 |

### 学习进度

| Method | Path | 说明 | 鉴权 |
|--------|------|------|------|
| GET | /api/progress/:address/:courseId | 获取进度 | 无 |
| POST | /api/progress/:address/:courseId | 更新进度 | 签名验证 |

## 鉴权方案

### 签名验证（EIP-712）

```typescript
// 前端签名
const message = {
  action: 'updateProfile',
  address: userAddress,
  timestamp: Date.now(),
};
const signature = await signTypedData({ ... });

// 后端验证
const recoveredAddress = verifyTypedData({ ... });
if (recoveredAddress !== claimedAddress) throw 403;
if (Date.now() - message.timestamp > 5 * 60 * 1000) throw 401; // 5分钟过期
```

### 视频权限验证

```typescript
// 后端调用链上合约
const hasPurchased = await publicClient.readContract({
  address: COURSE_MARKET_ADDRESS,
  abi: courseMarketAbi,
  functionName: 'hasPurchased',
  args: [userAddress, courseId],
});
if (!hasPurchased) return Response.json({ error: 'Not purchased' }, { status: 403 });
```

## contentHash 计算

```typescript
import { keccak256, encodePacked } from 'viem';

function computeContentHash(title: string, description: string, videoHashes: string[], coverHash: string): `0x${string}` {
  return keccak256(
    encodePacked(
      ['string', 'string', 'string', 'string'],
      [title, description, videoHashes.join(','), coverHash]
    )
  );
}
```

上架时后端计算 hash，传给前端/Owner 写入合约。展示时前端重新计算比对。

## 验收标准

- [ ] Worker 部署到 Cloudflare
- [ ] D1 数据库 schema 创建成功
- [ ] 课程 CRUD API 正常
- [ ] 视频权限验证链上购买状态
- [ ] 签名验证正确
- [ ] 学习进度存取正常

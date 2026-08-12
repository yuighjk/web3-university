# 7. Admin Panel — 开发规格

## 概述

Owner 管理后台，授权老师/商家、审批上架课程、给学生发证书。

## 功能列表

### 7.1 Provider 管理

- 展示已授权的 Teacher/Merchant 列表
- 添加新 Provider（输入地址 + 选择角色）
- 调用合约 `setProvider(address, ProviderType)`
- 交易确认后刷新列表

### 7.2 课程审批

- 从后端拉取 status=pending 的课程列表
- 展示课程详情（标题、描述、provider）
- Owner 审批按钮：
  - 后端计算 contentHash
  - 调用合约 `publishCourse(...)`
  - 交易确认后更新后端 status=published

### 7.3 发放证书

- 从后端拉取 progress=100% 的学生列表
- 展示：学生地址、课程名、完成时间
- Owner 点击"发证"：
  - 构建 tokenURI metadata JSON
  - 调用合约 `issueCertificate(student, courseId, tokenURI)`
  - 交易确认后标记已发证

### 7.4 权限控制

- 前端检测当前连接钱包是否 === Owner 地址
- 非 Owner 访问 /admin 显示"无权限"

## UI 设计

```
/admin
├── Tab: Provider 管理
│   ├── 已授权列表 (Table)
│   └── 添加表单 (Input + Select + Button)
├── Tab: 课程审批
│   ├── Pending 列表 (Table)
│   └── 审批操作 (Button → 调合约)
└── Tab: 证书发放
    ├── 待发证列表 (Table)
    └── 发证操作 (Button → 调合约)
```

## 验收标准

- [ ] 非 Owner 无法操作
- [ ] setProvider 交易成功
- [ ] publishCourse 交易成功 + 后端状态同步
- [ ] issueCertificate 交易成功 + SBT mint 到学生
- [ ] 所有操作有交易状态反馈

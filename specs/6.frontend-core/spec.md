# 6. Frontend Core — 开发规格

## 概述

React 19 前端应用，集成 Privy 钱包登录、课程列表、购买流程、个人中心。

## 技术栈

- React 19 + Vite
- Ant Design 5（UI 组件库）
- @privy-io/react-auth（钱包登录）
- wagmi + viem（合约交互）
- React Router（路由）
- TanStack Query（数据请求）

## 页面路由

| 路由 | 页面 | 组件 |
|------|------|------|
| / | 首页/课程列表 | CourseList |
| /course/:id | 课程详情 | CourseDetail |
| /swap | 代币兑换 | SwapPage |
| /profile | 个人中心 | ProfilePage |
| /admin | 管理后台 | AdminPage |

## Privy 集成

```tsx
// main.tsx
<PrivyProvider
  appId={import.meta.env.VITE_PRIVY_APP_ID}
  config={{
    loginMethods: ['wallet', 'email', 'google'],
    appearance: { theme: 'dark' },
    embeddedWallets: { createOnLogin: 'users-without-wallets' },
    supportedChains: [sepolia],
  }}
>
  <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </WagmiProvider>
</PrivyProvider>
```

Privy 替代 RainbowKit 提供钱包连接，同时支持社交登录。

## 课程列表页

```
1. 调用合约 getAllCourseIds()
2. Multicall 批量 getCourse(id) 拿链上数据
3. 调用后端 GET /api/courses 拿链下详情
4. 合并展示，只显示 active === true
5. 每个卡片显示：封面、标题、价格、provider
```

## 课程详情页

```
1. 读链上 getCourse(courseId)
2. 读后端 GET /api/courses/:id
3. 计算 contentHash 并与链上比对
4. 如已购买：显示视频列表（调 /api/courses/:id/videos）
5. 如未购买：显示购买按钮
```

## 购买流程（严格串行）

```typescript
async function handleBuy(courseId: number) {
  setStep('checking');
  
  // 1. 读课程价格
  const course = await readContract({ functionName: 'getCourse', args: [courseId] });
  const price = course.price;
  
  // 2. 检查 allowance
  const allowance = await readContract({
    address: YD_TOKEN_ADDRESS,
    functionName: 'allowance',
    args: [userAddress, COURSE_MARKET_ADDRESS],
  });
  
  // 3. 如需 approve
  if (allowance < price) {
    setStep('approving');
    const approveHash = await writeContractAsync({
      address: YD_TOKEN_ADDRESS,
      functionName: 'approve',
      args: [COURSE_MARKET_ADDRESS, price],
    });
    await waitForTransactionReceipt({ hash: approveHash });
  }
  
  // 4. 购买
  setStep('buying');
  const buyHash = await writeContractAsync({
    address: COURSE_MARKET_ADDRESS,
    functionName: 'buyCourse',
    args: [courseId],
  });
  await waitForTransactionReceipt({ hash: buyHash });
  
  // 5. 完成
  setStep('done');
  refetch();
}
```

## 个人中心

- 头像 + 用户名（可编辑，EIP-712 签名后提交后端）
- YD 余额
- USDC 余额
- 已购课程列表（getPurchasedCourses）
- 已获证书（遍历已购课程，查 hasCertificate）
- 学习进度（后端 API）

## contentHash 前端校验

```typescript
import { keccak256, encodePacked } from 'viem';

function verifyContentHash(course: CourseDetail, onChainHash: `0x${string}`): boolean {
  const computed = keccak256(
    encodePacked(
      ['string', 'string', 'string', 'string'],
      [course.title, course.description, course.videoHashes.join(','), course.coverHash]
    )
  );
  return computed === onChainHash;
}
```

不一致时显示警告横幅："⚠️ 课程内容指纹与链上记录不一致，内容可能已被篡改"

## 验收标准

- [ ] Privy 登录正常（钱包/Email/Google）
- [ ] 课程列表从合约 + 后端混合读取
- [ ] 购买流程 approve → buy 严格串行
- [ ] 购买后可看视频
- [ ] 个人中心展示余额、已购、证书
- [ ] contentHash 校验 + 篡改提示

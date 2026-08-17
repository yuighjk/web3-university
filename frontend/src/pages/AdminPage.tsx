import { useCallback, useState } from 'react';
import { useAccount, useReadContract, usePublicClient, useWalletClient } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  message,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { createPublicClient, custom } from 'viem';
import { waitForTransactionReceipt } from 'viem/actions';
import { sepolia } from 'viem/chains';
import { useWallets } from '@privy-io/react-auth';

import { courseMarketAbi, courseCertificateAbi } from '@/contracts/abis';
import { COURSE_MARKET_ADDRESS, COURSE_CERTIFICATE_ADDRESS } from '@/contracts/addresses';
import type { BackendCourse } from '@/types';
import { signAction } from '@/utils/signAction';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function AdminPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();

  const { data: ownerAddress, isLoading: ownerLoading } = useReadContract({
    address: COURSE_MARKET_ADDRESS,
    abi: courseMarketAbi,
    functionName: 'owner',
  });

  const isOwner =
    ownerAddress && address
      ? ownerAddress.toLowerCase() === address.toLowerCase()
      : false;

  if (ownerLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Spin size="large" tip="验证权限中..." />
      </div>
    );
  }

  if (!address) {
    return (
      <Alert
        type="info"
        showIcon
        message="请先连接钱包"
        description="需要连接 Owner 钱包才能访问管理后台"
        style={{ maxWidth: 480, margin: '40px auto' }}
      />
    );
  }

  if (!isOwner) {
    return (
      <Alert
        type="error"
        showIcon
        message="无权限"
        description={`当前地址 ${address.slice(0, 8)}...${address.slice(-6)} 不是合约 Owner，无法访问管理后台`}
        style={{ maxWidth: 480, margin: '40px auto' }}
      />
    );
  }

  return (
    <AdminContent
      address={address}
      publicClient={publicClient}
      walletClient={walletClient}
      queryClient={queryClient}
    />
  );
}

interface AdminContentProps {
  address: `0x${string}`;
  publicClient: ReturnType<typeof usePublicClient>;
  walletClient: ReturnType<typeof useWalletClient>['data'];
  queryClient: ReturnType<typeof useQueryClient>;
}

function AdminContent({ address, publicClient, walletClient, queryClient }: AdminContentProps) {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <Title level={2}>管理后台</Title>
      <Text type="secondary">当前 Owner：{address}</Text>

      <Tabs
        style={{ marginTop: 24 }}
        items={[
          {
            key: 'providers',
            label: '身份申请',
            children: (
              <ProviderTab
                publicClient={publicClient}
                walletClient={walletClient}
                queryClient={queryClient}
              />
            ),
          },
          {
            key: 'courses',
            label: '课程审批',
            children: (
              <CourseApprovalTab
                publicClient={publicClient}
                walletClient={walletClient}
                queryClient={queryClient}
              />
            ),
          },
          {
            key: 'certificates',
            label: '证书发放',
            children: (
              <CertificateTab
                publicClient={publicClient}
                walletClient={walletClient}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

interface TabProps {
  publicClient: ReturnType<typeof usePublicClient>;
  walletClient: ReturnType<typeof useWalletClient>['data'];
  queryClient?: ReturnType<typeof useQueryClient>;
}

function ProviderTab({ publicClient, walletClient, queryClient }: TabProps) {
  const [loading, setLoading] = useState(false);

  // Fetch pending provider applications from backend
  const { data: applications, isLoading: appsLoading, refetch: refetchApps } = useQuery<{ id: number; wallet_address: string; role: string; name: string; introduction: string; status: string; created_at: string }[]>({
    queryKey: ['provider-applications'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/provider-applications?status=pending`);
      if (!res.ok) return [];
      const json = await res.json() as { data: { id: number; wallet_address: string; role: string; name: string; introduction: string; status: string; created_at: string }[] };
      return json.data;
    },
    retry: 1,
  });

  const handleApprove = useCallback(async (app: { id: number; wallet_address: string; role: string; name: string }) => {
    if (!publicClient || !walletClient) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wc = walletClient as any;
    try {
      // 1. Call contract setProvider
      const pType = app.role === 'teacher' ? 1 : 2;
      const hash = (await wc.writeContract({
        address: COURSE_MARKET_ADDRESS,
        abi: courseMarketAbi,
        functionName: 'setProvider',
        args: [app.wallet_address as `0x${string}`, pType],
      })) as `0x${string}`;
      await waitForTransactionReceipt(publicClient, { hash });

      // 2. Update backend status
      await fetch(`${API_BASE}/api/provider-applications/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });

      message.success(`已批准 ${app.name} 为${app.role === 'teacher' ? '教师' : '商家'}`);
      void refetchApps();
      queryClient?.invalidateQueries({ queryKey: ['providers'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '操作失败';
      message.error(msg.includes('rejected') ? '用户取消了交易' : `审批失败：${msg.slice(0, 80)}`);
    } finally {
      setLoading(false);
    }
  }, [publicClient, walletClient, queryClient, refetchApps]);

  const handleReject = useCallback(async (app: { id: number; name: string }) => {
    await fetch(`${API_BASE}/api/provider-applications/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    message.info(`已拒绝 ${app.name} 的申请`);
    void refetchApps();
  }, [refetchApps]);

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (v: string) => <Tag color={v === 'teacher' ? 'blue' : 'green'}>{v === 'teacher' ? '教师' : '商家'}</Tag>,
    },
    {
      title: '钱包地址',
      dataIndex: 'wallet_address',
      key: 'wallet_address',
      render: (v: string) => <Text code style={{ fontSize: 11 }}>{`${v.slice(0, 8)}...${v.slice(-6)}`}</Text>,
    },
    { title: '介绍', dataIndex: 'introduction', key: 'introduction', ellipsis: true },
    {
      title: '申请时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => new Date(v).toLocaleDateString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: { id: number; wallet_address: string; role: string; name: string }) => (
        <Space>
          <Button type="primary" size="small" loading={loading} onClick={() => void handleApprove(record)}>
            批准
          </Button>
          <Button size="small" danger onClick={() => void handleReject(record)}>
            拒绝
          </Button>
        </Space>
      ),
    },
  ];

  if (appsLoading) return <Spin />;

  return (
    <Table
      dataSource={applications ?? []}
      columns={columns}
      rowKey="id"
      locale={{ emptyText: '暂无待审批的身份申请' }}
      size="small"
    />
  );
}

interface PendingCourse extends BackendCourse {
  content_hash: string;
  certificate_name?: string;
}

type ApprovalStage = 'checking' | 'authorizing' | 'publishing' | 'syncing';

const APPROVAL_STAGE_LABELS: Record<ApprovalStage, string> = {
  checking: '检查链上状态…',
  authorizing: '确认讲师授权…',
  publishing: '确认课程上架…',
  syncing: '同步审批状态…',
};

function CourseApprovalTab({ publicClient, walletClient, queryClient }: TabProps) {
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [approvalStage, setApprovalStage] = useState<ApprovalStage>('checking');
  const { wallets } = useWallets();
  const { address } = useAccount();

  const { data: pendingCourses, isLoading, isError, error, refetch } = useQuery<PendingCourse[]>({
    queryKey: ['pending-courses'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/courses?status=pending`);
      if (!res.ok) throw new Error('加载失败');
      const json = await res.json() as { data: PendingCourse[] };
      return json.data;
    },
    retry: 1,
  });

  const handlePublish = useCallback(
    async (course: PendingCourse) => {
      if (!publicClient || !walletClient) return;
      setLoadingId(course.course_id);
      setApprovalStage('checking');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wc = walletClient as any;
      try {
        const price = BigInt('4000000000000000000'); // 作业要求：4 YD
        if (!address) throw new Error('未连接 Owner 钱包');
        const signingWallet = wallets.find(
          (wallet) => wallet.address.toLowerCase() === address.toLowerCase(),
        );
        if (!signingWallet) throw new Error('Owner 钱包连接已失效，请重新连接');
        const walletProvider = await signingWallet.getEthereumProvider();
        const walletPublicClient = createPublicClient({
          chain: sepolia,
          transport: custom(walletProvider),
        });

        const providerType = await publicClient.readContract({
          address: COURSE_MARKET_ADDRESS,
          abi: courseMarketAbi,
          functionName: 'providers',
          args: [course.provider_address as `0x${string}`],
        });

        if (providerType === 0) {
          setApprovalStage('authorizing');
          message.info('第 1/2 步：请确认讲师授权；确认后会自动继续课程上架');
          const providerHash = (await wc.writeContract({
            address: COURSE_MARKET_ADDRESS,
            abi: courseMarketAbi,
            functionName: 'setProvider',
            args: [course.provider_address as `0x${string}`, 1],
          })) as `0x${string}`;
          const receipt = await walletPublicClient.waitForTransactionReceipt({ hash: providerHash });
          if (receipt.status !== 'success') throw new Error('讲师授权交易执行失败');
        }

        const onChainCourse = await publicClient.readContract({
          address: COURSE_MARKET_ADDRESS,
          abi: courseMarketAbi,
          functionName: 'getCourse',
          args: [BigInt(course.course_id)],
        });
        if (onChainCourse.id === 0n) {
          setApprovalStage('publishing');
          message.info(providerType === 0
            ? '第 2/2 步：讲师授权已完成，请确认课程上架'
            : '请在钱包中确认课程上架');
          const hash = (await wc.writeContract({
            address: COURSE_MARKET_ADDRESS,
            abi: courseMarketAbi,
            functionName: 'publishCourse',
            args: [
              BigInt(course.course_id),
              course.provider_address as `0x${string}`,
              `${API_BASE}/api/courses/${course.course_id}`,
              course.content_hash as `0x${string}`,
              course.certificate_name || `${course.title} 证书`,
              price,
            ],
          })) as `0x${string}`;
          const receipt = await walletPublicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== 'success') throw new Error('课程上架交易执行失败');
        }

        setApprovalStage('syncing');
        const timestamp = Date.now();
        const signature = await signAction(signingWallet, 'updateCourseStatus', timestamp);
        const statusResponse = await fetch(`${API_BASE}/api/courses/${course.course_id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'published', address, timestamp, signature }),
        });
        if (!statusResponse.ok) {
          const payload = await statusResponse.json().catch(() => null) as { error?: string } | null;
          throw new Error(payload?.error || '链上已上架，但数据库状态同步失败');
        }

        message.success(`课程 "${course.title}" 已上架`);
        await queryClient?.invalidateQueries({ queryKey: ['pending-courses'] });
        await queryClient?.invalidateQueries({ queryKey: ['backend-courses'] });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '操作失败';
        if (msg.includes('User rejected') || msg.includes('user rejected')) {
          message.error('用户取消了交易');
        } else {
          message.error(`上架失败：${msg.slice(0, 80)}`);
        }
      } finally {
        setLoadingId(null);
      }
    },
    [publicClient, walletClient, queryClient, address, wallets],
  );

  const columns = [
    { title: '课程 ID', dataIndex: 'course_id', key: 'course_id', width: 80 },
    { title: '标题', dataIndex: 'title', key: 'title' },
    {
      title: 'Provider',
      dataIndex: 'provider_address',
      key: 'provider_address',
      render: (v: string) => (
        <Text code style={{ fontSize: 11 }}>{`${v.slice(0, 8)}...${v.slice(-6)}`}</Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <Tag color="orange">{v}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: PendingCourse) => (
        <Button
          type="primary"
          size="small"
          loading={loadingId === record.course_id}
          onClick={() => void handlePublish(record)}
        >
          {loadingId === record.course_id ? APPROVAL_STAGE_LABELS[approvalStage] : '审批上架'}
        </Button>
      ),
    },
  ];

  if (isLoading) return <Spin />;
  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="待审批课程加载失败"
        description={error instanceof Error ? error.message : '请确认 Worker 和 D1 已启动'}
        action={<Button size="small" onClick={() => void refetch()}>重新加载</Button>}
      />
    );
  }

  return (
    <Table
      dataSource={pendingCourses ?? []}
      columns={columns}
      rowKey="course_id"
      locale={{ emptyText: '暂无待审批课程' }}
      size="small"
    />
  );
}

function CertificateTab({ publicClient }: TabProps) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const { address } = useAccount();
  const { wallets } = useWallets();

  // Fetch certificate requests from backend (pending)
  const { data: certRequests, isLoading, refetch } = useQuery<{ id: number; user_address: string; course_id: number; course_title: string; status: string; created_at: string }[]>({
    queryKey: ['certificate-requests'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/certificate-requests?status=pending`);
      if (!res.ok) return [];
      const json = await res.json() as { data: { id: number; user_address: string; course_id: number; course_title: string; status: string; created_at: string }[] };
      return json.data;
    },
    retry: 1,
  });

  const handleIssueCert = useCallback(
    async (req: { id: number; user_address: string; course_id: number; course_title: string }) => {
      if (!address) {
        message.error('请先连接钱包');
        return;
      }
      // Find any available wallet (external or embedded)
      const signingWallet = wallets.find((w) => w.address.toLowerCase() === address.toLowerCase())
        || wallets[0];
      if (!signingWallet) {
        message.error('未检测到可用钱包，请重新连接');
        return;
      }

      const key = `${req.user_address}-${req.course_id}`;
      setLoadingKey(key);
      try {
        const metadata = {
          name: `${req.course_title || '课程'} 结业证书`,
          description: `恭喜 ${req.user_address} 完成课程《${req.course_title}》`,
          attributes: [
            { trait_type: 'Course ID', value: req.course_id },
            { trait_type: 'Student', value: req.user_address },
            { trait_type: 'Issue Date', value: new Date().toISOString().slice(0, 10) },
          ],
        };
        const tokenURI = `data:application/json;base64,${btoa(JSON.stringify(metadata))}`;

        const provider = await signingWallet.getEthereumProvider();
        const walletPublicClient = createPublicClient({ chain: sepolia, transport: custom(provider) });
        const { createWalletClient } = await import('viem');
        const wc = createWalletClient({ account: address as `0x${string}`, chain: sepolia, transport: custom(provider) });

        const hash = await wc.writeContract({
          address: COURSE_CERTIFICATE_ADDRESS,
          abi: courseCertificateAbi,
          functionName: 'issueCertificate',
          args: [
            req.user_address as `0x${string}`,
            BigInt(req.course_id),
            tokenURI,
          ],
        });
        await walletPublicClient.waitForTransactionReceipt({ hash });

        // Update backend status
        await fetch(`${API_BASE}/api/certificate-requests/${req.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved' }),
        });

        message.success(`证书已发放给 ${req.user_address.slice(0, 8)}...`);
        void refetch();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '操作失败';
        if (msg.includes('User rejected') || msg.includes('user rejected')) {
          message.error('用户取消了交易');
        } else if (msg.includes('Certificate already issued')) {
          message.warning('该证书已发放');
          await fetch(`${API_BASE}/api/certificate-requests/${req.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'approved' }),
          });
          void refetch();
        } else {
          message.error(`发证失败：${msg.slice(0, 80)}`);
        }
      } finally {
        setLoadingKey(null);
      }
    },
    [publicClient, address, wallets, refetch],
  );

  const columns = [
    {
      title: '学生地址',
      dataIndex: 'user_address',
      key: 'user_address',
      render: (v: string) => (
        <Text code style={{ fontSize: 11 }}>{`${v.slice(0, 8)}...${v.slice(-6)}`}</Text>
      ),
    },
    { title: '课程', dataIndex: 'course_title', key: 'course_title' },
    {
      title: '申请时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => new Date(v).toLocaleDateString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: { id: number; user_address: string; course_id: number; course_title: string }) => {
        const key = `${record.user_address}-${record.course_id}`;
        return (
          <Button
            type="primary"
            size="small"
            loading={loadingKey === key}
            onClick={() => void handleIssueCert(record)}
          >
            发放证书
          </Button>
        );
      },
    },
  ];

  if (isLoading) return <Spin />;

  return (
    <Table
      dataSource={certRequests ?? []}
      columns={columns}
      rowKey={(r) => `${r.user_address}-${r.course_id}`}
      locale={{ emptyText: '暂无待处理的证书申请' }}
      size="small"
    />
  );
}

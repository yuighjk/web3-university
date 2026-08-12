import { useCallback, useState } from 'react';
import { useAccount, useReadContract, usePublicClient, useWalletClient } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  message,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { waitForTransactionReceipt } from 'viem/actions';

import { courseMarketAbi, courseCertificateAbi } from '@/contracts/abis';
import { COURSE_MARKET_ADDRESS, COURSE_CERTIFICATE_ADDRESS } from '@/contracts/addresses';
import type { BackendCourse } from '@/types';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const PROVIDER_TYPE_LABELS: Record<number, string> = {
  0: '无',
  1: '教师',
  2: '商家',
};

interface ProviderEntry {
  address: string;
  pType: number;
}

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
            label: 'Provider 管理',
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
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<ProviderEntry[]>([]);

  const handleSetProvider = useCallback(async () => {
    if (!publicClient || !walletClient) return;
    const values = await form.validateFields() as { providerAddress: string; pType: number };
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wc = walletClient as any;
    try {
      const hash = (await wc.writeContract({
        address: COURSE_MARKET_ADDRESS,
        abi: courseMarketAbi,
        functionName: 'setProvider',
        args: [values.providerAddress as `0x${string}`, values.pType],
      })) as `0x${string}`;
      await waitForTransactionReceipt(publicClient, { hash });
      message.success('Provider 设置成功');
      setProviders((prev) => [
        ...prev.filter((p) => p.address !== values.providerAddress),
        { address: values.providerAddress, pType: values.pType },
      ]);
      form.resetFields();
      queryClient?.invalidateQueries({ queryKey: ['providers'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '操作失败';
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        message.error('用户取消了交易');
      } else {
        message.error(`设置失败：${msg.slice(0, 80)}`);
      }
    } finally {
      setLoading(false);
    }
  }, [form, publicClient, walletClient, queryClient]);

  const columns = [
    {
      title: '地址',
      dataIndex: 'address',
      key: 'address',
      render: (v: string) => <Text code>{v}</Text>,
    },
    {
      title: '角色',
      dataIndex: 'pType',
      key: 'pType',
      render: (v: number) => <Tag>{PROVIDER_TYPE_LABELS[v] ?? '未知'}</Tag>,
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Card title="添加 / 修改 Provider">
        <Form form={form} layout="vertical" style={{ maxWidth: 480 }}>
          <Form.Item
            name="providerAddress"
            label="钱包地址"
            rules={[
              { required: true, message: '请输入地址' },
              { pattern: /^0x[0-9a-fA-F]{40}$/, message: '请输入合法的以太坊地址' },
            ]}
          >
            <Input placeholder="0x..." />
          </Form.Item>
          <Form.Item name="pType" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              options={[
                { value: 0, label: '无（撤销授权）' },
                { value: 1, label: '教师 (Teacher)' },
                { value: 2, label: '商家 (Merchant)' },
              ]}
            />
          </Form.Item>
          <Button type="primary" loading={loading} onClick={() => void handleSetProvider()}>
            提交到链上
          </Button>
        </Form>
      </Card>

      {providers.length > 0 && (
        <Card title="本次会话已设置的 Provider">
          <Table
            dataSource={providers}
            columns={columns}
            rowKey="address"
            size="small"
            pagination={false}
          />
        </Card>
      )}
    </Space>
  );
}

interface PendingCourse extends BackendCourse {
  content_hash: string;
}

function CourseApprovalTab({ publicClient, walletClient, queryClient }: TabProps) {
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const { data: pendingCourses, isLoading } = useQuery<PendingCourse[]>({
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wc = walletClient as any;
      try {
        const price = BigInt('1000000000000000000'); // 1 YD placeholder

        const hash = (await wc.writeContract({
          address: COURSE_MARKET_ADDRESS,
          abi: courseMarketAbi,
          functionName: 'publishCourse',
          args: [
            BigInt(course.course_id),
            course.provider_address as `0x${string}`,
            `${API_BASE}/api/courses/${course.course_id}`,
            course.content_hash as `0x${string}`,
            `${course.title} 证书`,
            price,
          ],
        })) as `0x${string}`;
        await waitForTransactionReceipt(publicClient, { hash });

        await fetch(`${API_BASE}/api/courses/${course.course_id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'published' }),
        });

        message.success(`课程 "${course.title}" 已上架`);
        queryClient?.invalidateQueries({ queryKey: ['pending-courses'] });
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
    [publicClient, walletClient, queryClient],
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
          审批上架
        </Button>
      ),
    },
  ];

  if (isLoading) return <Spin />;

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

interface CompletedStudent {
  user_address: string;
  course_id: number;
  course_title: string;
  completed_at: string;
}

function CertificateTab({ publicClient, walletClient }: TabProps) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const { data: students, isLoading, refetch } = useQuery<CompletedStudent[]>({
    queryKey: ['completed-students'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/progress?completed=true`);
      if (!res.ok) throw new Error('加载失败');
      const json = await res.json() as { data: CompletedStudent[] };
      return json.data;
    },
    retry: 1,
  });

  const handleIssueCert = useCallback(
    async (student: CompletedStudent) => {
      if (!publicClient || !walletClient) return;
      const key = `${student.user_address}-${student.course_id}`;
      setLoadingKey(key);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wc = walletClient as any;
      try {
        const metadata = {
          name: `${student.course_title} 结业证书`,
          description: `恭喜 ${student.user_address} 完成课程《${student.course_title}》`,
          attributes: [
            { trait_type: 'Course ID', value: student.course_id },
            { trait_type: 'Student', value: student.user_address },
            { trait_type: 'Completed At', value: student.completed_at },
          ],
        };
        const tokenURI = `data:application/json;base64,${btoa(JSON.stringify(metadata))}`;

        const hash = (await wc.writeContract({
          address: COURSE_CERTIFICATE_ADDRESS,
          abi: courseCertificateAbi,
          functionName: 'issueCertificate',
          args: [
            student.user_address as `0x${string}`,
            BigInt(student.course_id),
            tokenURI,
          ],
        })) as `0x${string}`;
        await waitForTransactionReceipt(publicClient, { hash });

        message.success(`证书已发放给 ${student.user_address.slice(0, 8)}...`);
        void refetch();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '操作失败';
        if (msg.includes('User rejected') || msg.includes('user rejected')) {
          message.error('用户取消了交易');
        } else if (msg.includes('Certificate already issued')) {
          message.warning('该证书已发放');
        } else {
          message.error(`发证失败：${msg.slice(0, 80)}`);
        }
      } finally {
        setLoadingKey(null);
      }
    },
    [publicClient, walletClient, refetch],
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
    { title: '完成时间', dataIndex: 'completed_at', key: 'completed_at' },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: CompletedStudent) => {
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
      dataSource={students ?? []}
      columns={columns}
      rowKey={(r: CompletedStudent) => `${r.user_address}-${r.course_id}`}
      locale={{ emptyText: '暂无待发证书的学生' }}
      size="small"
    />
  );
}

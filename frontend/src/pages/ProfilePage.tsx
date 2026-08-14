import { useState, useCallback } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  List,
  message,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { UserOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { formatUnits } from 'viem';
import { usePrivy, useWallets } from '@privy-io/react-auth';

import { ydTokenAbi, mockUsdcAbi, courseMarketAbi, courseCertificateAbi } from '@/contracts/abis';
import {
  YD_TOKEN_ADDRESS,
  MOCK_USDC_ADDRESS,
  COURSE_MARKET_ADDRESS,
  COURSE_CERTIFICATE_ADDRESS,
} from '@/contracts/addresses';
import type { UserProfile, BackendCourse } from '@/types';
import { signAction } from '@/utils/signAction';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function ProfilePage() {
  const { address } = useAccount();
  const { authenticated, user } = usePrivy();
  const accountAddress = address ?? (user?.wallet?.address as `0x${string}` | undefined);
  const { wallets } = useWallets();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [form] = Form.useForm();

  // Token balances
  const { data: ydBalance } = useReadContract({
    address: YD_TOKEN_ADDRESS,
    abi: ydTokenAbi,
    functionName: 'balanceOf',
    args: [accountAddress ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!accountAddress },
  });

  const { data: usdcBalance } = useReadContract({
    address: MOCK_USDC_ADDRESS,
    abi: mockUsdcAbi,
    functionName: 'balanceOf',
    args: [accountAddress ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!accountAddress },
  });

  // Purchased course IDs from contract
  const { data: purchasedIds } = useReadContract({
    address: COURSE_MARKET_ADDRESS,
    abi: courseMarketAbi,
    functionName: 'getPurchasedCourses',
    args: [accountAddress ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!accountAddress },
  });

  // User profile from backend
  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ['user-profile', accountAddress],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/users/${accountAddress}`);
      if (!res.ok) throw new Error('获取用户资料失败');
      const json = await res.json() as { data: UserProfile };
      const raw = json.data as UserProfile & { avatarUrl?: string | null; updatedAt?: string };
      return { ...raw, avatar_url: raw.avatar_url ?? raw.avatarUrl ?? null, updated_at: raw.updated_at ?? raw.updatedAt ?? '' };
    },
    enabled: !!accountAddress,
    retry: 1,
  });

  // Backend course list (to resolve IDs → titles)
  const { data: allCourses } = useQuery<BackendCourse[]>({
    queryKey: ['backend-courses'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/courses`);
      if (!res.ok) throw new Error('课程列表加载失败');
      const json = await res.json() as { data: BackendCourse[] };
      return json.data;
    },
    retry: 1,
  });

  // Certificate check per purchased course
  const { data: certResults } = useQuery<{ courseId: bigint; has: boolean }[]>({
    queryKey: ['certificates', accountAddress, purchasedIds?.toString()],
    queryFn: async () => {
      if (!accountAddress || !purchasedIds || purchasedIds.length === 0) return [];
      // Read each certificate check individually via publicClient multicall
      const { createPublicClient, http } = await import('viem');
      const { sepolia } = await import('wagmi/chains');
      const client = createPublicClient({
        chain: sepolia,
        transport: http(import.meta.env.VITE_SEPOLIA_RPC_URL || undefined),
      });
      const results = await client.multicall({
        contracts: purchasedIds.map((id) => ({
          address: COURSE_CERTIFICATE_ADDRESS,
          abi: courseCertificateAbi,
          functionName: 'hasCertificate' as const,
          args: [accountAddress, id] as [`0x${string}`, bigint],
        })),
      });
      return purchasedIds.map((id, i) => ({
        courseId: id,
        has: results[i].status === 'success' ? (results[i].result as boolean) : false,
      }));
    },
    enabled: !!accountAddress && !!purchasedIds && purchasedIds.length > 0,
    retry: 1,
  });

  // Profile update mutation (EIP-712 signed)
  const updateMutation = useMutation({
    mutationFn: async (values: { username: string; avatar_url: string }) => {
      if (!accountAddress) throw new Error('账户尚未创建钱包');
      const signingWallet = wallets.find(
        (wallet) => wallet.address.toLowerCase() === accountAddress.toLowerCase(),
      );
      if (!signingWallet) throw new Error('当前账户的钱包尚未就绪，请刷新页面后重试');

      const timestamp = Date.now();
      const signature = await signAction(signingWallet, 'updateProfile', timestamp);

      const res = await fetch(`${API_BASE}/api/users/${accountAddress}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: values.username,
          avatarUrl: values.avatar_url,
          timestamp,
          signature,
        }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || '更新失败');
      }
      return res.json() as Promise<{ data: UserProfile }>;
    },
    onSuccess: () => {
      message.success('资料更新成功');
      setEditMode(false);
      void queryClient.invalidateQueries({ queryKey: ['user-profile', accountAddress] });
      void queryClient.invalidateQueries({ queryKey: ['layout-profile', accountAddress] });
    },
    onError: (err: Error) => {
      if (err.message.includes('User rejected') || err.message.includes('user rejected') || err.message.includes('rejected')) {
        message.error('用户取消了签名');
      } else {
        message.error(`更新失败：${err.message.slice(0, 80)}`);
      }
    },
  });

  const handleSaveProfile = useCallback(async () => {
    if (!accountAddress) {
      message.error('请先连接钱包');
      return;
    }
    try {
      const values = await form.validateFields() as { username: string; avatar_url: string };
      updateMutation.mutate(values);
    } catch (err) {
      // validation failed or user cancelled
      if (err && typeof err === 'object' && 'errorFields' in err) {
        message.error('请检查表单输入');
      }
    }
  }, [form, updateMutation, accountAddress]);

  if (!authenticated) {
    return (
      <div style={{ maxWidth: 600, margin: '40px auto' }}>
        <Alert
          type="info"
          message="请先登录"
          description="连接钱包或使用邮件/Google 登录后查看个人中心"
          showIcon
        />
      </div>
    );
  }

  const certificates = certResults?.filter((c) => c.has) ?? [];
  const shortAddr = accountAddress ? `${accountAddress.slice(0, 8)}...${accountAddress.slice(-6)}` : '登录后创建钱包';

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <Title level={2}>个人中心</Title>

      {/* Profile card */}
      <Card
        title="基本信息"
        extra={
          !editMode ? (
            <Button size="small" disabled={!accountAddress} onClick={() => { setEditMode(true); form.setFieldsValue(profile ?? {}); }}>
              {accountAddress ? '编辑资料' : '连接钱包后编辑'}
            </Button>
          ) : null
        }
        style={{ marginBottom: 24 }}
      >
        {profileLoading ? (
          <Spin />
        ) : editMode ? (
          <Form form={form} layout="vertical">
            <Form.Item name="username" label="用户名">
              <Input placeholder="输入用户名" maxLength={32} />
            </Form.Item>
            <Form.Item name="avatar_url" label="头像 URL">
              <Input placeholder="https://..." />
            </Form.Item>
            <Space>
              <Button
                type="primary"
                loading={updateMutation.isPending}
                onClick={handleSaveProfile}
              >
                {updateMutation.isPending ? '等待签名并保存…' : '保存'}
              </Button>
              <Button onClick={() => setEditMode(false)}>取消</Button>
            </Space>
          </Form>
        ) : (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="头像">
              <Avatar
                size={48}
                src={profile?.avatar_url}
                icon={!profile?.avatar_url ? <UserOutlined /> : undefined}
              />
            </Descriptions.Item>
            <Descriptions.Item label="用户名">
              {profile?.username ?? <Text type="secondary">未设置</Text>}
            </Descriptions.Item>
            <Descriptions.Item label="钱包地址">
              <Text code>{shortAddr}</Text>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {/* Balances */}
      <Card title="代币余额" style={{ marginBottom: 24 }}>
        <Space size={16}>
          <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>
            YD: {ydBalance !== undefined ? Number(formatUnits(ydBalance as bigint, 18)).toFixed(4) : '--'}
          </Tag>
          <Tag color="green" style={{ fontSize: 14, padding: '4px 12px' }}>
            mUSDC: {usdcBalance !== undefined ? Number(formatUnits(usdcBalance as bigint, 6)).toFixed(2) : '--'}
          </Tag>
        </Space>
      </Card>

      {/* Purchased courses */}
      <Card title={`已购课程（${purchasedIds?.length ?? 0} 门）`} style={{ marginBottom: 24 }}>
        {!purchasedIds || purchasedIds.length === 0 ? (
          <Text type="secondary">尚未购买任何课程</Text>
        ) : (
          <List
            dataSource={purchasedIds ? [...purchasedIds] : []}
            renderItem={(courseId) => {
              const backend = allCourses?.find((c) => BigInt(c.course_id) === courseId);
              const cert = certResults?.find((c) => c.courseId === courseId);
              return (
                <List.Item>
                  <List.Item.Meta
                    title={backend?.title ?? `课程 #${courseId}`}
                    description={`ID: ${courseId}`}
                  />
                  {cert?.has && (
                    <Tag icon={<SafetyCertificateOutlined />} color="gold">
                      已获证书
                    </Tag>
                  )}
                </List.Item>
              );
            }}
          />
        )}
      </Card>

      {/* Certificates */}
      <Card title={`已获证书（${certificates.length} 张）`}>
        {certificates.length === 0 ? (
          <Text type="secondary">暂无证书。课程学习进度达到 100% 后，由 Owner 在管理台审核并从 CourseCertificate 合约铸造。</Text>
        ) : (
          <List
            dataSource={certificates}
            renderItem={({ courseId }) => {
              const backend = allCourses?.find((c) => BigInt(c.course_id) === courseId);
              return (
                <List.Item>
                  <List.Item.Meta
                    avatar={<SafetyCertificateOutlined style={{ fontSize: 24, color: '#faad14' }} />}
                    title={backend?.title ?? `课程 #${courseId}`}
                    description="Soulbound NFT 证书"
                  />
                </List.Item>
              );
            }}
          />
        )}
        <Divider />
        <Text type="secondary" style={{ fontSize: 11 }}>
          证书来自本项目部署的 ERC-721 CourseCertificate 合约，是不可转让的 Soulbound NFT，永久绑定到完成课程的钱包地址。
        </Text>
      </Card>
    </div>
  );
}

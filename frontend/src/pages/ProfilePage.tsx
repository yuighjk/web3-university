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
import { usePrivy, useSignTypedData } from '@privy-io/react-auth';

import { ydTokenAbi, mockUsdcAbi, courseMarketAbi, courseCertificateAbi } from '@/contracts/abis';
import {
  YD_TOKEN_ADDRESS,
  MOCK_USDC_ADDRESS,
  COURSE_MARKET_ADDRESS,
  COURSE_CERTIFICATE_ADDRESS,
} from '@/contracts/addresses';
import type { UserProfile, BackendCourse } from '@/types';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// EIP-712 domain + type for profile update
const EIP712_DOMAIN = {
  name: 'Web3University',
  version: '1',
  chainId: 11155111,
} as const;

// MessageTypes requires mutable arrays, so we don't use `as const` here
const EIP712_TYPES = {
  UpdateProfile: [
    { name: 'action', type: 'string' },
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

export default function ProfilePage() {
  const { address } = useAccount();
  const { authenticated } = usePrivy();
  const { signTypedData } = useSignTypedData();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [form] = Form.useForm();

  // Token balances
  const { data: ydBalance } = useReadContract({
    address: YD_TOKEN_ADDRESS,
    abi: ydTokenAbi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!address },
  });

  const { data: usdcBalance } = useReadContract({
    address: MOCK_USDC_ADDRESS,
    abi: mockUsdcAbi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!address },
  });

  // Purchased course IDs from contract
  const { data: purchasedIds } = useReadContract({
    address: COURSE_MARKET_ADDRESS,
    abi: courseMarketAbi,
    functionName: 'getPurchasedCourses',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!address },
  });

  // User profile from backend
  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ['user-profile', address],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/users/${address}`);
      if (!res.ok) throw new Error('获取用户资料失败');
      const json = await res.json() as { data: UserProfile };
      const raw = json.data as UserProfile & { avatarUrl?: string | null; updatedAt?: string };
      return { ...raw, avatar_url: raw.avatar_url ?? raw.avatarUrl ?? null, updated_at: raw.updated_at ?? raw.updatedAt ?? '' };
    },
    enabled: !!address,
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
    queryKey: ['certificates', address, purchasedIds?.toString()],
    queryFn: async () => {
      if (!address || !purchasedIds || purchasedIds.length === 0) return [];
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
          args: [address, id] as [`0x${string}`, bigint],
        })),
      });
      return purchasedIds.map((id, i) => ({
        courseId: id,
        has: results[i].status === 'success' ? (results[i].result as boolean) : false,
      }));
    },
    enabled: !!address && !!purchasedIds && purchasedIds.length > 0,
    retry: 1,
  });

  // Profile update mutation (EIP-712 signed)
  const updateMutation = useMutation({
    mutationFn: async (values: { username: string; avatar_url: string }) => {
      if (!address) throw new Error('未连接钱包');

      const timestamp = BigInt(Date.now());
      const signature = await signTypedData({
        domain: EIP712_DOMAIN,
        types: EIP712_TYPES,
        primaryType: 'UpdateProfile',
        message: {
          action: 'updateProfile',
          address: address as `0x${string}`,
          timestamp,
        },
      });

      const res = await fetch(`${API_BASE}/api/users/${address}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: values.username,
          avatarUrl: values.avatar_url,
          timestamp: timestamp.toString(),
          signature,
        }),
      });
      if (!res.ok) throw new Error('更新失败');
      return res.json() as Promise<{ data: UserProfile }>;
    },
    onSuccess: () => {
      message.success('资料更新成功');
      setEditMode(false);
      void queryClient.invalidateQueries({ queryKey: ['user-profile', address] });
    },
    onError: (err: Error) => {
      if (err.message.includes('User rejected') || err.message.includes('user rejected')) {
        message.error('用户取消了签名');
      } else {
        message.error(`更新失败：${err.message.slice(0, 80)}`);
      }
    },
  });

  const handleSaveProfile = useCallback(() => {
    void form.validateFields().then((values: { username: string; avatar_url: string }) => {
      updateMutation.mutate(values);
    });
  }, [form, updateMutation]);

  if (!authenticated || !address) {
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
  const shortAddr = `${address.slice(0, 8)}...${address.slice(-6)}`;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <Title level={2}>个人中心</Title>

      {/* Profile card */}
      <Card
        title="基本信息"
        extra={
          !editMode ? (
            <Button size="small" onClick={() => { setEditMode(true); form.setFieldsValue(profile ?? {}); }}>
              编辑资料
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
                保存
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
            USDC: {usdcBalance !== undefined ? Number(formatUnits(usdcBalance as bigint, 6)).toFixed(2) : '--'}
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
          <Text type="secondary">暂无证书，完成课程后由管理员发放</Text>
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
          证书为 Soulbound NFT，不可转让，永久绑定到您的钱包地址。
        </Text>
      </Card>
    </div>
  );
}

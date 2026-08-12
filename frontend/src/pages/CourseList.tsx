import { useReadContract } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Tag, Spin, Empty, Typography, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import { formatUnits } from 'viem';

import { courseMarketAbi } from '@/contracts/abis';
import { COURSE_MARKET_ADDRESS } from '@/contracts/addresses';
import type { BackendCourse, OnChainCourse } from '@/types';

const { Title, Text, Paragraph } = Typography;

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function CourseList() {
  const navigate = useNavigate();

  // 1. Read all course IDs from contract
  const { data: courseIds, isLoading: idsLoading } = useReadContract({
    address: COURSE_MARKET_ADDRESS,
    abi: courseMarketAbi,
    functionName: 'getAllCourseIds',
  });

  // 2. Fetch each course from contract via individual reads
  //    (wagmi multicall via useReadContracts)
  const { data: onChainCourses, isLoading: coursesLoading } = useQuery({
    queryKey: ['onchain-courses', courseIds?.toString()],
    enabled: !!courseIds && courseIds.length > 0,
    queryFn: async () => {
      // Dynamic import to avoid circular dep in strict mode
      const { createPublicClient, http } = await import('viem');
      const { sepolia } = await import('wagmi/chains');
      const client = createPublicClient({
        chain: sepolia,
        transport: http(import.meta.env.VITE_SEPOLIA_RPC_URL || undefined),
      });
      const results = await client.multicall({
        contracts: (courseIds ?? []).map((id) => ({
          address: COURSE_MARKET_ADDRESS,
          abi: courseMarketAbi,
          functionName: 'getCourse' as const,
          args: [id] as [bigint],
        })),
      });
      return results
        .map((r) => (r.status === 'success' ? (r.result as OnChainCourse) : null))
        .filter(Boolean) as OnChainCourse[];
    },
  });

  // 3. Fetch backend course list
  const { data: backendCourses, isLoading: backendLoading } = useQuery<BackendCourse[]>({
    queryKey: ['backend-courses'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/courses`);
      if (!res.ok) throw new Error('后端接口错误');
      const json = await res.json() as { data: BackendCourse[] };
      return json.data;
    },
    // Gracefully degrade if backend is not yet deployed
    retry: 1,
  });

  const isLoading = idsLoading || coursesLoading || backendLoading;

  // 4. Merge on-chain + backend, only show active courses
  const merged = (onChainCourses ?? [])
    .filter((c) => c.active)
    .map((c) => {
      const backend = (backendCourses ?? []).find((b) => BigInt(b.course_id) === c.id);
      return {
        id: Number(c.id),
        title: backend?.title ?? `课程 #${c.id}`,
        description: backend?.description ?? '',
        coverUrl: backend?.cover_url ?? '',
        price: c.price,
        provider: `${c.provider.slice(0, 6)}...${c.provider.slice(-4)}`,
        active: c.active,
      };
    });

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Spin size="large" tip="加载课程中..." />
      </div>
    );
  }

  if (merged.length === 0) {
    return (
      <div style={{ padding: '80px 0' }}>
        <Empty description="暂无课程" />
      </div>
    );
  }

  return (
    <div>
      <Title level={2} style={{ marginBottom: 24 }}>全部课程</Title>
      <Row gutter={[24, 24]}>
        {merged.map((course) => (
          <Col key={course.id} xs={24} sm={12} md={8} lg={6}>
            <Card
              hoverable
              cover={
                course.coverUrl ? (
                  <img
                    alt={course.title}
                    src={course.coverUrl}
                    style={{ height: 160, objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      height: 160,
                      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#888', fontSize: 14 }}>暂无封面</Text>
                  </div>
                )
              }
              onClick={() => navigate(`/course/${course.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <Card.Meta
                title={course.title}
                description={
                  <Space direction="vertical" style={{ width: '100%' }} size={4}>
                    {course.description && (
                      <Paragraph
                        ellipsis={{ rows: 2 }}
                        style={{ marginBottom: 0, color: '#888', fontSize: 12 }}
                      >
                        {course.description}
                      </Paragraph>
                    )}
                    <Space>
                      <Tag color="blue">{formatUnits(course.price, 18)} YD</Tag>
                      <Text style={{ fontSize: 11, color: '#666' }}>
                        {course.provider}
                      </Text>
                    </Space>
                  </Space>
                }
              />
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}

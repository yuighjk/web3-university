import { useReadContract } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Tag, Spin, Empty, Typography, Space, Button } from 'antd';
import { ArrowRightOutlined, BookOutlined, SafetyCertificateOutlined, SwapOutlined, UserAddOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { formatUnits } from 'viem';

import { courseMarketAbi, courseCertificateAbi } from '@/contracts/abis';
import { COURSE_MARKET_ADDRESS, COURSE_CERTIFICATE_ADDRESS } from '@/contracts/addresses';
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

  const { data: certificateName } = useReadContract({
    address: COURSE_CERTIFICATE_ADDRESS,
    abi: courseCertificateAbi,
    functionName: 'name',
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

  return (
    <div className="course-page">
      <section className="course-hero">
        <div className="hero-content">
          <Tag className="hero-tag">链上确权 · 链下学习</Tag>
          <Title>把每一次学习，写进你的<br /><span>Web3 身份</span></Title>
          <Paragraph>用 YD 币购买课程，完成视频学习，经自动执行器核验后获得不可转让的 ERC721 结业证书。</Paragraph>
          <Space size={14}>
          <Button type="primary" size="large" onClick={() => document.getElementById('course-market')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>探索课程 <ArrowRightOutlined /></Button>
            <Button size="large" ghost onClick={() => navigate('/swap')}>获取 YD 币</Button>
          </Space>
        </div>
        <div className="hero-token">YD</div>
      </section>

      <Row gutter={[22, 22]} className="course-stats">
        <Col xs={24} md={8}><Card bordered={false}><BookOutlined /><strong>{isLoading ? '…' : merged.length}</strong><span>精品 Web3 课程</span></Card></Col>
        <Col xs={24} md={8}><Card bordered={false}><SwapOutlined /><strong>{isLoading ? '…' : merged[0] ? `${formatUnits(merged[0].price, 18)} YD` : '—'}</strong><span>当前课程价格</span></Card></Col>
        <Col xs={24} md={8}><Card bordered={false}><SafetyCertificateOutlined /><strong>{isLoading ? '…' : certificateName || '—'}</strong><span>不可转让结业证书</span></Card></Col>
      </Row>

      <section id="course-market" className="market-section">
        <div className="market-heading">
          <div>
            <Title level={1}>课程市场</Title>
            <Text type="secondary">数据库承载丰富内容，Sepolia 合约记录价格、状态和购买关系。</Text>
          </div>
          <Button className="teacher-button" icon={<UserAddOutlined />} onClick={() => navigate('/creator')}>申请成为老师</Button>
        </div>
        {isLoading ? <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin size="large" tip="加载课程中..." /></div> : merged.length === 0 ? <div style={{ padding: '60px 0' }}><Empty description="暂无课程" /></div> : (
          <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
            {merged.map((course) => (
              <Col key={course.id} xs={24} sm={12} lg={8}>
                <Card hoverable className="course-card" cover={course.coverUrl ? <img alt={course.title} src={course.coverUrl} /> : <div className="course-cover">Web3</div>} onClick={() => navigate(`/course/${course.id}`)}>
                  <Card.Meta title={course.title} description={<Space direction="vertical" size={5}>{course.description && <Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0 }}>{course.description}</Paragraph>}<Tag color="purple">{formatUnits(course.price, 18)} YD</Tag></Space>} />
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </section>
    </div>
  );
}

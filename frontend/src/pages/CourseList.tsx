import { useMemo, useState } from 'react';
import { useReadContract } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, Input, Spin, Typography } from 'antd';
import { ArrowRightOutlined, SearchOutlined, StarOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatUnits } from 'viem';

import { courseMarketAbi } from '@/contracts/abis';
import { COURSE_MARKET_ADDRESS } from '@/contracts/addresses';
import type { BackendCourse, OnChainCourse } from '@/types';

const { Title, Text, Paragraph } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function CourseList() {
  const navigate = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search).get('q')?.trim().toLowerCase() ?? '';
  const [search, setSearch] = useState(query);

  const { data: courseIds, isLoading: idsLoading } = useReadContract({
    address: COURSE_MARKET_ADDRESS, abi: courseMarketAbi, functionName: 'getAllCourseIds',
  });
  const { data: onChainCourses, isLoading: coursesLoading } = useQuery({
    queryKey: ['onchain-courses', courseIds?.toString()], enabled: !!courseIds && courseIds.length > 0,
    queryFn: async () => {
      const { createPublicClient, http } = await import('viem');
      const { sepolia } = await import('wagmi/chains');
      const client = createPublicClient({ chain: sepolia, transport: http(import.meta.env.VITE_SEPOLIA_RPC_URL || undefined) });
      const results = await client.multicall({ contracts: (courseIds ?? []).map((id) => ({ address: COURSE_MARKET_ADDRESS, abi: courseMarketAbi, functionName: 'getCourse' as const, args: [id] as [bigint] })) });
      return results.map((result) => result.status === 'success' ? result.result as OnChainCourse : null).filter(Boolean) as OnChainCourse[];
    },
  });
  const { data: backendCourses, isLoading: backendLoading } = useQuery<BackendCourse[]>({
    queryKey: ['backend-courses'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/courses`);
      if (!response.ok) throw new Error('课程接口暂不可用');
      return ((await response.json()) as { data: BackendCourse[] }).data;
    }, retry: 1,
  });

  const merged = useMemo(() => (onChainCourses ?? []).filter((item) => item.active).map((item) => {
    const backend = (backendCourses ?? []).find((course) => BigInt(course.course_id) === item.id);
    return { id: Number(item.id), title: backend?.title ?? `课程 #${item.id}`, description: backend?.description ?? '', coverUrl: backend?.cover_url ?? '', price: item.price, provider: item.provider };
  }), [onChainCourses, backendCourses]);

  const courses = useMemo(() => {
    return merged.filter((course) => {
      const matchesSearch = !query || `${course.title} ${course.description}`.toLowerCase().includes(query);
      return matchesSearch;
    });
  }, [merged, query]);

  const isLoading = idsLoading || coursesLoading || backendLoading;

  return (
    <div className="course-page academy-market">
      <section className="academy-hero">
        <Text className="eyebrow"><span /> WEB3 大学 · SEPOLIA</Text>
        <Title>链上技能，<br />由学习与证书共同证明</Title>
        <Paragraph>一所为开放互联网而生的大学。老师与商家提交课程，经 Owner 审核后写入 Sepolia；学生用 USDC 兑换 YD、购买并完成学习，最终获得永久绑定钱包的 ERC721 结业证书。</Paragraph>
        <div className="hero-actions">
          <Button type="primary" onClick={() => document.getElementById('course-market')?.scrollIntoView({ behavior: 'smooth' })}>浏览课程 <ArrowRightOutlined /></Button>
          <Button onClick={() => navigate('/profile')}>申请成为讲师</Button>
        </div>
        <div className="hero-stats">
          <div><strong>{isLoading ? '—' : `${merged.length}+`}</strong><span>已发布课程</span><small>链上课程与线下内容绑定</small></div>
          <div><strong>Sepolia</strong><span>以太坊测试链</span><small>课程、价格与购买关系可验证</small></div>
          <div><strong>ERC721</strong><span>结业凭证</span><small>完成学习后永久绑定钱包</small></div>
        </div>
      </section>

      <section id="course-market">
        <div className="published-heading">
          <div>
            <Title level={2}>已发布的课程</Title>
            <Paragraph>从链上读取课程状态与 YD 价格，课程详情、视频和评论由数据库按 courseId 关联。</Paragraph>
          </div>
          <Input.Search value={search} onChange={(event) => setSearch(event.target.value)} onSearch={(value) => navigate(value.trim() ? `/?q=${encodeURIComponent(value.trim())}` : '/')} prefix={<SearchOutlined />} placeholder="搜索课程..." enterButton="搜索" allowClear />
        </div>

        {isLoading ? <div className="page-state"><Spin size="large" /></div> : courses.length === 0 ? <div className="page-state"><Empty description={query ? `没有找到“${query}”相关课程` : '暂无已发布课程'} /></div> : (
          <div className="academy-course-grid">
            {courses.map((course, index) => (
              <article className="academy-course-card" key={course.id} onClick={() => navigate(`/course/${course.id}`)}>
                <div className="academy-card-cover">
                  {course.coverUrl ? <img src={course.coverUrl} alt={course.title} /> : <div className="cover-placeholder">WEB3<br />ACADEMY</div>}
                  <span>{index % 3 === 0 ? '进阶' : '入门'}</span>
                </div>
                <div className="academy-card-content">
                  <div className="card-kicker"><span>WEB3 COURSE</span><span><StarOutlined /> 5.0</span></div>
                  <h2>{course.title}</h2>
                  <p>{course.description || '课程内容已通过链上指纹绑定，购买后即可进入学习。'}</p>
                  <div className="instructor-row"><span className="instructor-avatar">{course.provider.slice(2, 4).toUpperCase()}</span><span>{`${course.provider.slice(0, 8)}...${course.provider.slice(-6)}`}</span></div>
                  <div className="card-footer"><div><small>课程费用</small><strong>{formatUnits(course.price, 18)} YD</strong></div><Button>查看课程 <ArrowRightOutlined /></Button></div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

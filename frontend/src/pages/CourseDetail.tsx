import { useParams } from 'react-router-dom';
import { useReadContract, useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  List,
  Space,
  Spin,
  Steps,
  Tag,
  Typography,
} from 'antd';
import { PlayCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { formatUnits, keccak256, encodePacked } from 'viem';

import { courseMarketAbi, courseCertificateAbi } from '@/contracts/abis';
import { COURSE_MARKET_ADDRESS, COURSE_CERTIFICATE_ADDRESS } from '@/contracts/addresses';
import { useBuyCourse } from '@/hooks/useBuyCourse';
import type { BackendCourseDetail, OnChainCourse } from '@/types';

const { Title, Text, Paragraph } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Step label map for the buy flow progress indicator
const STEP_LABELS: Record<string, string> = {
  idle: '',
  checking: '检查授权',
  approving: '授权 YD',
  buying: '购买课程',
  done: '购买完成',
  error: '购买失败',
};

const BUY_STEPS = [
  { title: '检查授权' },
  { title: '授权 YD' },
  { title: '购买课程' },
  { title: '完成' },
];

function getBuyStepIndex(step: string): number {
  const map: Record<string, number> = {
    checking: 0,
    approving: 1,
    buying: 2,
    done: 3,
  };
  return map[step] ?? 0;
}

/**
 * Verify content integrity: recompute keccak256 from backend data and compare
 * with the on-chain hash. Returns true when they match.
 */
function verifyContentHash(
  detail: BackendCourseDetail,
  onChainHash: `0x${string}`,
): boolean {
  const videoHashesJoined = detail.video_urls.join(',');
  const computed = keccak256(
    encodePacked(
      ['string', 'string', 'string', 'string'],
      [detail.title, detail.description, videoHashesJoined, detail.cover_url],
    ),
  );
  return computed === onChainHash;
}

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const { address } = useAccount();
  const courseId = BigInt(id ?? '0');

  // On-chain course data
  const {
    data: onChainCourse,
    isLoading: chainLoading,
    refetch: refetchChain,
  } = useReadContract({
    address: COURSE_MARKET_ADDRESS,
    abi: courseMarketAbi,
    functionName: 'getCourse',
    args: [courseId],
    query: { enabled: courseId > 0n },
  });

  // Has user purchased?
  const { data: hasPurchased, refetch: refetchPurchased } = useReadContract({
    address: COURSE_MARKET_ADDRESS,
    abi: courseMarketAbi,
    functionName: 'hasPurchased',
    args: [address ?? '0x0000000000000000000000000000000000000000', courseId],
    query: { enabled: !!address && courseId > 0n },
  });

  // Has user got a certificate?
  const { data: hasCertificate } = useReadContract({
    address: COURSE_CERTIFICATE_ADDRESS,
    abi: courseCertificateAbi,
    functionName: 'hasCertificate',
    args: [address ?? '0x0000000000000000000000000000000000000000', courseId],
    query: { enabled: !!address && courseId > 0n },
  });

  // Backend course detail (no videos)
  const { data: backendDetail, isLoading: backendLoading } = useQuery<BackendCourseDetail>({
    queryKey: ['course-detail', id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/courses/${id}`);
      if (!res.ok) throw new Error('课程详情加载失败');
      const json = await res.json() as { data: BackendCourseDetail };
      return json.data;
    },
    enabled: !!id,
    retry: 1,
  });

  // Video list — only fetched when user has purchased
  const { data: videos } = useQuery<string[]>({
    queryKey: ['course-videos', id, address],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/courses/${id}/videos`, {
        headers: address ? { 'x-user-address': address } : {},
      });
      if (!res.ok) throw new Error('视频加载失败');
      const json = await res.json() as { data: string[] };
      return json.data;
    },
    enabled: !!id && !!hasPurchased && hasPurchased === true,
    retry: 1,
  });

  const handleSuccess = () => {
    void refetchChain();
    void refetchPurchased();
  };

  const { step, buy } = useBuyCourse(handleSuccess);

  const course = onChainCourse as OnChainCourse | undefined;
  const isLoading = chainLoading || backendLoading;

  const contentHashValid =
    backendDetail && course
      ? verifyContentHash(backendDetail, course.contentHash)
      : null;

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Spin size="large" tip="加载课程中..." />
      </div>
    );
  }

  if (!course || course.id === 0n) {
    return <Alert type="error" message="课程不存在" showIcon />;
  }

  const isBuying = ['checking', 'approving', 'buying'].includes(step);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Content hash integrity warning */}
      {contentHashValid === false && (
        <Alert
          type="warning"
          showIcon
          message="课程内容指纹与链上记录不一致，内容可能已被篡改"
          style={{ marginBottom: 16 }}
          banner
        />
      )}

      {/* Course header */}
      <Card
        cover={
          backendDetail?.cover_url ? (
            <img
              alt={backendDetail.title}
              src={backendDetail.cover_url}
              style={{ maxHeight: 320, objectFit: 'cover', width: '100%' }}
            />
          ) : null
        }
        style={{ marginBottom: 24 }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Title level={2} style={{ marginBottom: 0 }}>
            {backendDetail?.title ?? `课程 #${id}`}
          </Title>

          <Space wrap>
            <Tag color="blue" style={{ fontSize: 14 }}>
              {formatUnits(course.price, 18)} YD
            </Tag>
            {hasCertificate && (
              <Tag icon={<SafetyCertificateOutlined />} color="gold">
                已获证书
              </Tag>
            )}
            {hasPurchased && <Tag color="green">已购买</Tag>}
            {!course.active && <Tag color="red">已下架</Tag>}
          </Space>

          {backendDetail?.description && (
            <Paragraph style={{ color: '#ccc' }}>{backendDetail.description}</Paragraph>
          )}

          <Descriptions column={1} size="small" labelStyle={{ color: '#888' }}>
            <Descriptions.Item label="课程 ID">{id}</Descriptions.Item>
            <Descriptions.Item label="讲师">{`${course.provider.slice(0, 8)}...${course.provider.slice(-6)}`}</Descriptions.Item>
            <Descriptions.Item label="证书名称">{course.certificateName}</Descriptions.Item>
            <Descriptions.Item label="内容指纹">
              <Text code style={{ fontSize: 11 }}>
                {course.contentHash.slice(0, 18)}...
              </Text>
              {contentHashValid === true && <Tag color="green" style={{ marginLeft: 8 }}>已验证</Tag>}
            </Descriptions.Item>
          </Descriptions>
        </Space>
      </Card>

      {/* Purchase / video section */}
      {!hasPurchased ? (
        <Card title="购买课程">
          {step !== 'idle' && step !== 'error' && (
            <Steps
              current={getBuyStepIndex(step)}
              items={BUY_STEPS}
              style={{ marginBottom: 24 }}
            />
          )}

          {step === 'error' && (
            <Alert type="error" message="购买失败，请重试" style={{ marginBottom: 16 }} showIcon />
          )}

          <Space direction="vertical">
            <Text>
              购买此课程需要 <Tag color="blue">{formatUnits(course.price, 18)} YD</Tag>
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前步骤：{STEP_LABELS[step] || '就绪'}
            </Text>
            <Button
              type="primary"
              size="large"
              loading={isBuying}
              disabled={!address || !course.active}
              onClick={() => void buy(courseId, course.price)}
            >
              {!address ? '请先登录' : isBuying ? '处理中...' : '立即购买'}
            </Button>
          </Space>
        </Card>
      ) : (
        <Card title="课程内容">
          {videos && videos.length > 0 ? (
            <List
              dataSource={videos}
              renderItem={(url, index) => (
                <List.Item
                  actions={[
                    <Button
                      key="play"
                      type="link"
                      icon={<PlayCircleOutlined />}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      播放
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<PlayCircleOutlined style={{ fontSize: 20, color: '#1677ff' }} />}
                    title={`第 ${index + 1} 节`}
                    description={url}
                  />
                </List.Item>
              )}
            />
          ) : (
            <Text type="secondary">暂无视频内容，请联系讲师</Text>
          )}

          <Divider />
          <Text type="secondary" style={{ fontSize: 12 }}>
            视频内容受版权保护，请勿转发或录制。
          </Text>
        </Card>
      )}
    </div>
  );
}

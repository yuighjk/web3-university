import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { useReadContract, useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Divider,
  Input,
  List,
  message,
  Progress,
  Space,
  Spin,
  Steps,
  Tag,
  Typography,
} from 'antd';
import {
  PlayCircleOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  LockOutlined,
  CheckCircleOutlined,
  UserOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { formatUnits, keccak256, encodePacked } from 'viem';

import { courseMarketAbi, courseCertificateAbi } from '@/contracts/abis';
import { COURSE_MARKET_ADDRESS, COURSE_CERTIFICATE_ADDRESS } from '@/contracts/addresses';
import { useBuyCourse } from '@/hooks/useBuyCourse';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { signAction } from '@/utils/signAction';
import type { BackendCourseDetail, OnChainCourse } from '@/types';

const { Title, Text, Paragraph } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const BUY_STEPS = [
  { title: '检查授权' },
  { title: '授权 YD' },
  { title: '购买课程' },
  { title: '完成' },
];

function getBuyStepIndex(step: string): number {
  const map: Record<string, number> = { checking: 0, approving: 1, buying: 2, done: 3 };
  return map[step] ?? 0;
}

function verifyContentHash(
  detail: BackendCourseDetail,
  onChainHash: `0x${string}`,
): boolean {
  try {
    const videoUrls = detail.video_urls ?? [];
    const videoHashesJoined = videoUrls
      .map((url) => keccak256(encodePacked(['string'], [url])))
      .join(',');
    const computed = keccak256(
      encodePacked(
        ['string', 'string', 'string', 'string'],
        [detail.title, detail.description, videoHashesJoined, keccak256(encodePacked(['string'], [detail.cover_url]))],
      ),
    );
    return computed === onChainHash;
  } catch {
    return false;
  }
}

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const { address } = useAccount();
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const externalWallet = wallets.find((w) => w.walletClientType !== 'privy');
  const [comment, setComment] = useState('');
  const [commenting, setCommenting] = useState(false);
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

  // Backend course detail
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
      const res = await fetch(`${API_BASE}/api/courses/${id}/videos?address=${address}`);
      if (!res.ok) return [];
      const json = await res.json() as { data: { videoUrls: string[] } };
      return json.data.videoUrls;
    },
    enabled: !!id && !!address && hasPurchased === true,
    retry: 1,
  });

  const { data: progressData, refetch: refetchProgress } = useQuery<{ progress: number; completedAt: string | null }>({
    queryKey: ['progress', address, id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/progress/${address}/${id}`);
      const json = await res.json() as { data: { progress: number; completedAt: string | null } };
      return json.data;
    },
    enabled: !!address && !!id && hasPurchased === true,
  });

  const { data: comments, refetch: refetchComments } = useQuery<{ id: number; user_address: string; content: string; created_at: string }[]>({
    queryKey: ['comments', id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/courses/${id}/comments`);
      if (!res.ok) return [];
      const json = await res.json() as { data: { id: number; user_address: string; content: string; created_at: string }[] };
      return json.data;
    },
    enabled: !!id,
  });

  const submitComment = async () => {
    if (!address || !authenticated || !comment.trim() || !externalWallet) return;
    setCommenting(true);
    try {
      const timestamp = Date.now();
      const signature = await signAction(externalWallet, 'postComment', timestamp);
      const res = await fetch(`${API_BASE}/api/courses/${id}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: comment.trim(), address, timestamp, signature }),
      });
      if (!res.ok) throw new Error('评论需要购买课程后才能发布');
      setComment('');
      message.success('评论发布成功');
      void refetchComments();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '评论发布失败');
    } finally {
      setCommenting(false);
    }
  };

  const handleSuccess = () => {
    void refetchChain();
    void refetchPurchased();
  };

  const { step, buy } = useBuyCourse(handleSuccess);

  const course = onChainCourse as OnChainCourse | undefined;
  const isLoading = chainLoading || backendLoading;
  const contentHashValid = backendDetail && course ? verifyContentHash(backendDetail, course.contentHash) : null;

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!course || course.id === 0n) {
    return <Alert type="error" message="课程不存在" showIcon />;
  }

  const isBuying = ['checking', 'approving', 'buying'].includes(step);
  const title = backendDetail?.title ?? '课程';
  const description = backendDetail?.description ?? '';
  const providerShort = `${course.provider.slice(0, 6)}...${course.provider.slice(-4)}`;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
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

      {/* Hero Section */}
      <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', marginBottom: 24 }}>
        {backendDetail?.cover_url ? (
          <img
            alt={title}
            src={backendDetail.cover_url}
            style={{ width: '100%', height: 280, objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: 280, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Title level={1} style={{ color: '#fff', margin: 0 }}>{title}</Title>
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '40px 28px 20px', background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}>
          <Space wrap>
            {hasPurchased && <Tag color="green" icon={<CheckCircleOutlined />}>已购买</Tag>}
            {hasCertificate && <Tag color="gold" icon={<SafetyCertificateOutlined />}>已获证书</Tag>}
            {!course.active && <Tag color="red">已下架</Tag>}
          </Space>
        </div>
      </div>

      {/* Course Info */}
      <Card style={{ marginBottom: 24, borderRadius: 12 }} styles={{ body: { padding: '28px 32px' } }}>
        <Title level={2} style={{ marginBottom: 8 }}>{title}</Title>

        <Space style={{ marginBottom: 16 }} wrap>
          <Tag color="purple" style={{ fontSize: 13, padding: '2px 10px' }}>{formatUnits(course.price, 18)} YD</Tag>
          <Tag icon={<UserOutlined />} style={{ fontSize: 12 }}>讲师 {providerShort}</Tag>
          {course.certificateName && (
            <Tag icon={<SafetyCertificateOutlined />} color="cyan" style={{ fontSize: 12 }}>证书：{course.certificateName}</Tag>
          )}
          {contentHashValid === true && <Tag color="green" style={{ fontSize: 11 }}>内容已验证</Tag>}
        </Space>

        {description && (
          <Paragraph style={{ color: '#555', fontSize: 15, lineHeight: 1.8, marginBottom: 0 }}>
            {description}
          </Paragraph>
        )}
      </Card>

      {/* Purchase Section */}
      {!hasPurchased && (
        <Card style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #e8dff5' }} styles={{ body: { padding: '24px 32px' } }}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <LockOutlined style={{ fontSize: 20, color: '#7355f5' }} />
              <div>
                <Text strong style={{ fontSize: 15 }}>购买课程解锁完整内容</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  购买后可查看课程视频、参与评论，完成学习可获得链上证书
                </Text>
              </div>
            </div>

            {step !== 'idle' && step !== 'error' && (
              <Steps current={getBuyStepIndex(step)} items={BUY_STEPS} size="small" />
            )}
            {step === 'error' && (
              <Alert type="error" message="购买失败，请重试" showIcon />
            )}

            <Button
              type="primary"
              size="large"
              loading={isBuying}
              disabled={!address || !course.active}
              onClick={() => void buy(courseId, course.price)}
              style={{ height: 44, fontSize: 15, borderRadius: 8 }}
            >
              {!address ? '连接钱包后购买' : isBuying ? '处理中...' : `购买课程 · ${formatUnits(course.price, 18)} YD`}
            </Button>
          </Space>
        </Card>
      )}

      {/* Video Section */}
      {hasPurchased && (
        <Card
          title={<span><PlayCircleOutlined style={{ marginRight: 8 }} />课程视频</span>}
          style={{ marginBottom: 24, borderRadius: 12 }}
          styles={{ body: { padding: '20px 24px' } }}
        >
          {/* Learning Progress */}
          <div style={{ marginBottom: 20, padding: '12px 16px', background: '#f8f6ff', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text strong style={{ fontSize: 13 }}>学习进度</Text>
              <Text type="secondary" style={{ fontSize: 13 }}>{progressData?.progress ?? 0}%</Text>
            </div>
            <Progress percent={progressData?.progress ?? 0} strokeColor="#7355f5" showInfo={false} />
            {(progressData?.progress ?? 0) < 100 && (
              <Button
                size="small"
                type="link"
                style={{ padding: 0, marginTop: 4, fontSize: 12 }}
                onClick={async () => {
                  if (!address || !externalWallet) return;
                  try {
                    const timestamp = Date.now();
                    const signature = await signAction(externalWallet, 'updateProgress', timestamp);
                    await fetch(`${API_BASE}/api/progress/${address}/${id}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ progress: 100, timestamp, signature }),
                    });
                    void refetchProgress();
                    message.success('已标记课程完成');
                  } catch {
                    message.error('操作失败');
                  }
                }}
              >
                标记为已完成
              </Button>
            )}
          </div>

          {videos && videos.length > 0 ? (
            <List
              dataSource={videos}
              renderItem={(url, index) => (
                <List.Item
                  style={{ padding: '12px 0' }}
                  actions={[
                    <Button
                      key="play"
                      type="primary"
                      ghost
                      size="small"
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
                    avatar={<div style={{ width: 32, height: 32, borderRadius: 8, background: '#f0ecff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7355f5', fontWeight: 600 }}>{index + 1}</div>}
                    title={<Text style={{ fontSize: 14 }}>第 {index + 1} 节</Text>}
                    description={<Text type="secondary" style={{ fontSize: 12 }}>{url.length > 60 ? url.slice(0, 60) + '...' : url}</Text>}
                  />
                </List.Item>
              )}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#999' }}>
              <PlayCircleOutlined style={{ fontSize: 32, marginBottom: 8 }} />
              <br />
              <Text type="secondary">视频内容加载中...</Text>
            </div>
          )}
        </Card>
      )}

      {/* Comments Section */}
      <Card
        title={<span>💬 学员评论 ({comments?.length ?? 0})</span>}
        style={{ borderRadius: 12 }}
        styles={{ body: { padding: '20px 24px' } }}
      >
        {/* Comment Input */}
        {hasPurchased ? (
          <div style={{ marginBottom: 16 }}>
            <Input.TextArea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="分享你的学习心得..."
              maxLength={2000}
              rows={3}
              style={{ borderRadius: 8, marginBottom: 8 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={commenting}
                disabled={!comment.trim()}
                onClick={() => void submitComment()}
                size="small"
              >
                发布评论
              </Button>
            </div>
          </div>
        ) : (
          <Alert
            message="购买课程后可参与评论"
            type="info"
            showIcon
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        <Divider style={{ margin: '12px 0' }} />

        {comments && comments.length > 0 ? (
          <List
            dataSource={comments}
            renderItem={(item) => (
              <List.Item style={{ padding: '12px 0', border: 'none' }}>
                <List.Item.Meta
                  avatar={
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e8e0ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#7355f5', fontWeight: 600 }}>
                      {item.user_address.slice(2, 4).toUpperCase()}
                    </div>
                  }
                  title={
                    <Space>
                      <Text style={{ fontSize: 12, color: '#666' }}>{item.user_address.slice(0, 6)}...{item.user_address.slice(-4)}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        <ClockCircleOutlined style={{ marginRight: 3 }} />
                        {new Date(item.created_at).toLocaleDateString('zh-CN')}
                      </Text>
                    </Space>
                  }
                  description={<Text style={{ fontSize: 14, color: '#333' }}>{item.content}</Text>}
                />
              </List.Item>
            )}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#999' }}>
            <Text type="secondary">暂无评论，快来发表你的看法吧</Text>
          </div>
        )}
      </Card>
    </div>
  );
}

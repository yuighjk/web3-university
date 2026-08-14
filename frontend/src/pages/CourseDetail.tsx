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
  BookOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  LockOutlined,
  UserOutlined,
  ClockCircleOutlined,
  ReadOutlined,
  PlaySquareOutlined,
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

/** Convert YouTube watch URL to embed URL */
function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') && u.searchParams.has('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    }
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.hostname.includes('bilibili.com')) {
      const bv = u.pathname.match(/\/(BV[\w]+)/)?.[1];
      if (bv) return `https://player.bilibili.com/player.html?bvid=${bv}&high_quality=1`;
    }
    // Direct mp4 or other embed-friendly URL
    return url;
  } catch {
    return url;
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

  const { data: hasPurchased, refetch: refetchPurchased } = useReadContract({
    address: COURSE_MARKET_ADDRESS,
    abi: courseMarketAbi,
    functionName: 'hasPurchased',
    args: [address ?? '0x0000000000000000000000000000000000000000', courseId],
    query: { enabled: !!address && courseId > 0n },
  });

  const { data: _hasCertificate } = useReadContract({
    address: COURSE_CERTIFICATE_ADDRESS,
    abi: courseCertificateAbi,
    functionName: 'hasCertificate',
    args: [address ?? '0x0000000000000000000000000000000000000000', courseId],
    query: { enabled: !!address && courseId > 0n },
  });

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
    if (!address || !authenticated || !comment.trim()) return;
    setCommenting(true);
    try {
      let signature: `0x${string}` | undefined;
      const timestamp = Date.now();
      if (externalWallet) {
        signature = await signAction(externalWallet, 'postComment', timestamp);
      }
      const res = await fetch(`${API_BASE}/api/courses/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: comment.trim(), address, timestamp, signature: signature ?? '0x' }),
      });
      if (!res.ok) throw new Error('评论需要购买课程后才能发布');
      setComment('');
      message.success('评论发布成功');
      void refetchComments();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '评论发布失败';
      message.error(msg.includes('rejected') ? '用户取消了签名' : msg);
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
    return <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" /></div>;
  }

  if (!course || course.id === 0n) {
    return <Alert type="error" message="课程不存在" showIcon />;
  }

  const isBuying = ['checking', 'approving', 'buying'].includes(step);
  const title = backendDetail?.title ?? '课程';
  const description = backendDetail?.description ?? '';
  const providerShort = `${course.provider.slice(0, 6)}...${course.provider.slice(-4)}`;
  const videoUrl = videos?.[0];
  const embedUrl = videoUrl ? toEmbedUrl(videoUrl) : null;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {contentHashValid === false && (
        <Alert type="warning" showIcon message="课程内容指纹与链上记录不一致，内容可能已被篡改" style={{ marginBottom: 16 }} banner />
      )}

      {/* Top Video Player (replaces cover image) */}
      <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 24, background: '#000' }}>
        {hasPurchased && embedUrl ? (
          <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%' }}>
            <iframe
              src={embedUrl}
              title="课程视频"
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              {!hasPurchased ? (
                <>
                  <LockOutlined style={{ fontSize: 48, marginBottom: 12, opacity: 0.7 }} />
                  <Text style={{ color: '#ccc', fontSize: 15 }}>购买课程后解锁视频</Text>
                </>
              ) : (
                <>
                  <BookOutlined style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }} />
                  <Text style={{ color: '#999', fontSize: 14 }}>视频加载中...</Text>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Course Introduction Card */}
      <Card
        title={<span><ReadOutlined style={{ marginRight: 8, color: '#7355f5' }} />课程介绍</span>}
        style={{ marginBottom: 24, borderRadius: 12 }}
        styles={{ body: { padding: '24px 28px' } }}
      >
        <Title level={3} style={{ marginBottom: 12 }}>{title}</Title>

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
        <Card style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #e8dff5' }} styles={{ body: { padding: '24px 28px' } }}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <LockOutlined style={{ fontSize: 20, color: '#7355f5' }} />
              <div>
                <Text strong style={{ fontSize: 15 }}>购买课程解锁完整内容</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 13 }}>购买后可观看课程视频、参与讨论，完成学习可获得链上证书</Text>
              </div>
            </div>

            {step !== 'idle' && step !== 'error' && (
              <Steps current={getBuyStepIndex(step)} items={BUY_STEPS} size="small" />
            )}
            {step === 'error' && <Alert type="error" message="购买失败，请重试" showIcon />}

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

      {/* Course Progress (purchased only) */}
      {hasPurchased && (
        <Card
          title={<span><PlaySquareOutlined style={{ marginRight: 8, color: '#7355f5' }} />课程进度</span>}
          style={{ marginBottom: 24, borderRadius: 12 }}
          styles={{ body: { padding: '24px 28px' } }}
        >
          <div style={{ padding: '14px 18px', background: '#f8f6ff', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text strong style={{ fontSize: 14 }}>学习进度</Text>
              <Text style={{ fontSize: 14, color: '#7355f5', fontWeight: 600 }}>{progressData?.progress ?? 0}%</Text>
            </div>
            <Progress percent={progressData?.progress ?? 0} strokeColor="#7355f5" showInfo={false} size={{ height: 8 }} />
            {(progressData?.progress ?? 0) < 100 && (
              <Button
                size="small"
                type="link"
                style={{ padding: 0, marginTop: 8, fontSize: 12 }}
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
        </Card>
      )}

      {/* Comments / Discussion Section */}
      <Card
        title={<span><SendOutlined style={{ marginRight: 8, color: '#7355f5' }} />学员讨论 ({comments?.length ?? 0})</span>}
        style={{ borderRadius: 12 }}
        styles={{ body: { padding: '20px 28px' } }}
      >
        {hasPurchased ? (
          <div style={{ marginBottom: 16 }}>
            <Input.TextArea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="分享你的学习心得..."
              maxLength={2000}
              rows={3}
              style={{ borderRadius: 8, marginBottom: 10 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="primary"
                loading={commenting}
                disabled={!comment.trim()}
                onClick={() => void submitComment()}
                style={{
                  borderRadius: 20,
                  paddingInline: 20,
                  opacity: !comment.trim() ? 0.5 : 1,
                  color: !comment.trim() ? '#999' : '#fff',
                  background: !comment.trim() ? '#e8e8e8' : undefined,
                  borderColor: !comment.trim() ? '#e8e8e8' : undefined,
                }}
              >
                发送
              </Button>
            </div>
          </div>
        ) : (
          <Alert
            message="购买课程后可参与讨论"
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
              <List.Item style={{ padding: '14px 0', border: 'none' }}>
                <List.Item.Meta
                  avatar={
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f0ecff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#7355f5', fontWeight: 600 }}>
                      {item.user_address.slice(2, 4).toUpperCase()}
                    </div>
                  }
                  title={
                    <Space>
                      <Text style={{ fontSize: 13, color: '#333' }}>{item.user_address.slice(0, 6)}...{item.user_address.slice(-4)}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        <ClockCircleOutlined style={{ marginRight: 3 }} />
                        {new Date(item.created_at).toLocaleDateString('zh-CN')}
                      </Text>
                    </Space>
                  }
                  description={<Text style={{ fontSize: 14, color: '#444', lineHeight: 1.6 }}>{item.content}</Text>}
                />
              </List.Item>
            )}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#aaa' }}>
            <Text type="secondary">暂无讨论，购买课程后来分享你的学习心得吧</Text>
          </div>
        )}
      </Card>
    </div>
  );
}

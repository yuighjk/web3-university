import { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, Row, Tag, Typography, message } from 'antd';
import { usePrivy, useWallets } from '@privy-io/react-auth';

import { signAction } from '@/utils/signAction';

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DRAFT_STORAGE_KEY = 'web3-university:creator-course-draft';

const STATUS_LABELS: Record<string, { color: string; text: string }> = {
  pending: { color: 'gold', text: '审核中' },
  approved: { color: 'green', text: '已通过' },
  rejected: { color: 'red', text: '已拒绝' },
};

interface CourseRequest {
  id: number;
  course_id: number;
  title: string;
  status: string;
  created_at: string;
}

interface CourseDraft {
  title?: string;
  summary?: string;
  description?: string;
  category?: string;
  certificateName?: string;
  videoUrl?: string;
  coverUrl?: string;
}

export default function CreatorPage() {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const externalWallet = wallets.find((wallet) => wallet.walletClientType !== 'privy');
  const accountAddress = externalWallet?.address as `0x${string}` | undefined;
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<CourseRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) form.setFieldsValue(JSON.parse(saved) as CourseDraft);
    } catch {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, [form]);

  useEffect(() => {
    if (!accountAddress) {
      setRequests([]);
      return;
    }
    setRequestsLoading(true);
    fetch(`${API_BASE}/api/course-requests?wallet=${accountAddress}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('申请记录加载失败');
        return r.json();
      })
      .then((json) => { if (json?.data) setRequests(json.data as CourseRequest[]); })
      .catch((error: unknown) => {
        message.error(error instanceof Error ? error.message : '申请记录加载失败');
      })
      .finally(() => setRequestsLoading(false));
  }, [accountAddress]);

  const submit = async () => {
    if (!authenticated) { message.info('请先登录账户'); return; }
    if (!accountAddress) { message.info('课程提交需要先连接外部钱包'); return; }

    setSubmitting(true);
    try {
      const values = await form.validateFields() as {
        title: string;
        summary: string;
        description: string;
        category: string;
        certificateName: string;
        videoUrl: string;
        coverUrl: string;
      };

      const timestamp = Date.now();
      if (!externalWallet) throw new Error('请先连接 MetaMask 或 Base 钱包');
      const signature = await signAction(externalWallet, 'submitCourse', timestamp);
      const response = await fetch(`${API_BASE}/api/course-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, address: accountAddress, timestamp, signature }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || '课程提交失败');
      }
      message.success('课程申请已提交，等待 Owner 审核');
      form.resetFields();
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      // refresh list
      const listResp = await fetch(`${API_BASE}/api/course-requests?wallet=${accountAddress}`);
      if (listResp.ok) {
        const json = await listResp.json() as { data: CourseRequest[] };
        setRequests(json.data);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : '课程提交失败';
      message.error(text.includes('rejected') || text.includes('User rejected') ? '用户取消了签名' : text);
    } finally {
      setSubmitting(false);
    }
  };

  if (!authenticated) {
    return <Alert showIcon type="info" message="创作者中心" description="登录账户后可以查看课程申请入口。" />;
  }

  return (
    <>
      {!accountAddress && (
        <Alert
          showIcon
          type="info"
          message="提交课程前请连接钱包"
          description="草稿会自动保存在当前浏览器。连接 MetaMask 或 Base 钱包后才能签名提交，并查看该钱包的申请记录。"
          style={{ marginBottom: 20 }}
        />
      )}
      <Row gutter={24} align="top">
      {/* 左侧：提交表单 */}
      <Col xs={24} lg={16}>
        <Card title="提交课程资料" bordered={false}>
          <Form
            form={form}
            layout="vertical"
            requiredMark="optional"
            onValuesChange={(_, values: CourseDraft) => {
              window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(values));
            }}
          >
            <Form.Item name="title" label={<span><span style={{ color: 'red', marginRight: 4 }}>*</span>课程名称</span>} rules={[{ required: true, message: '请输入课程名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="summary" label={<span><span style={{ color: 'red', marginRight: 4 }}>*</span>一句话简介</span>} rules={[{ required: true, message: '请输入简介' }]}>
              <Input showCount maxLength={180} />
            </Form.Item>
            <Form.Item name="description" label={<span><span style={{ color: 'red', marginRight: 4 }}>*</span>详细介绍</span>} rules={[{ required: true, message: '请输入详细介绍' }]}>
              <Input.TextArea rows={5} showCount maxLength={2000} />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="category" label={<span><span style={{ color: 'red', marginRight: 4 }}>*</span>分类</span>} rules={[{ required: true, message: '请输入分类' }]} extra="例如：Solidity / DeFi / 预言机">
                  <Input placeholder="Solidity / DeFi / 预言机" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="certificateName" label={<span><span style={{ color: 'red', marginRight: 4 }}>*</span>证书名称</span>} rules={[{ required: true, message: '请输入证书名称' }]} extra="完成课程后颁发的证书名称">
                  <Input placeholder="例如：Solidity 开发专家" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="videoUrl" label={<span><span style={{ color: 'red', marginRight: 4 }}>*</span>视频 URL</span>} rules={[{ required: true, message: '请输入视频 URL' }]}>
              <Input placeholder="https://..." />
            </Form.Item>
            <Form.Item name="coverUrl" label={<span><span style={{ color: 'red', marginRight: 4 }}>*</span>封面 URL</span>} rules={[{ required: true, message: '请输入封面 URL' }]}>
              <Input placeholder="https://..." />
            </Form.Item>
            <Button type="primary" loading={submitting} disabled={!accountAddress} onClick={() => void submit()}>
              {submitting ? '等待钱包签名并提交…' : '签名并提交上架申请'}
            </Button>
          </Form>
        </Card>
      </Col>

      {/* 右侧：我的课程申请 */}
      <Col xs={24} lg={8}>
        <Card title="我的课程申请" bordered={false}>
          {requestsLoading ? (
            <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '32px 0' }}>正在读取申请记录…</Text>
          ) : !accountAddress ? (
            <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '32px 0' }}>连接钱包后显示记录</Text>
          ) : requests.length === 0 ? (
            <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '32px 0' }}>
              暂无申请
            </Text>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {requests.map((req) => (
                <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{req.title}</div>
                    <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                      课程 #{req.course_id} · {new Date(req.created_at).toLocaleDateString('zh-CN')}
                    </div>
                  </div>
                  <Tag color={STATUS_LABELS[req.status]?.color ?? 'default'}>
                    {STATUS_LABELS[req.status]?.text ?? req.status}
                  </Tag>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Col>
      </Row>
    </>
  );
}

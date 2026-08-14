import { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, Row, Tag, Typography, message } from 'antd';
import { useAccount } from 'wagmi';
import { usePrivy, useSignTypedData } from '@privy-io/react-auth';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const EIP712_DOMAIN = { name: 'Web3University', version: '1', chainId: 11155111 } as const;
const EIP712_TYPES = {
  Action: [
    { name: 'action', type: 'string' },
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

const STATUS_LABELS: Record<string, { color: string; text: string }> = {
  pending: { color: 'gold', text: '审核中' },
  approved: { color: 'green', text: '已通过' },
  rejected: { color: 'red', text: '已拒绝' },
};

interface CourseRequest {
  id: number;
  title: string;
  status: string;
  created_at: string;
}

export default function CreatorPage() {
  const { address } = useAccount();
  const { authenticated, user } = usePrivy();
  const accountAddress = address ?? (user?.wallet?.address as `0x${string}` | undefined);
  const { signTypedData } = useSignTypedData();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<CourseRequest[]>([]);

  useEffect(() => {
    if (!accountAddress) return;
    fetch(`${API_BASE}/api/course-requests?wallet=${accountAddress}`)
      .then((r) => r.ok ? r.json() : null)
      .then((json) => { if (json?.data) setRequests(json.data as CourseRequest[]); })
      .catch(() => {});
  }, [accountAddress]);

  const submit = async () => {
    if (!authenticated) { message.info('请先登录账户'); return; }
    if (!accountAddress) { message.info('课程提交需要先连接外部钱包'); return; }

    const values = await form.validateFields() as {
      title: string;
      summary: string;
      description: string;
      category: string;
      certificateName: string;
      videoUrl: string;
      coverUrl: string;
    };

    setSubmitting(true);
    try {
      const timestamp = Date.now();
      const signature = await signTypedData({
        domain: EIP712_DOMAIN,
        types: EIP712_TYPES,
        primaryType: 'Action',
        message: { action: 'submitCourse', address: accountAddress, timestamp: BigInt(timestamp) },
      });
      const response = await fetch(`${API_BASE}/api/course-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, address: accountAddress, timestamp, signature }),
      });
      if (!response.ok) throw new Error('课程提交失败');
      message.success('课程申请已提交，等待 Owner 审核');
      form.resetFields();
      // refresh list
      const listResp = await fetch(`${API_BASE}/api/course-requests?wallet=${accountAddress}`);
      if (listResp.ok) {
        const json = await listResp.json() as { data: CourseRequest[] };
        setRequests(json.data);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : '课程提交失败';
      message.error(text.includes('rejected') ? '用户取消了签名' : text);
    } finally {
      setSubmitting(false);
    }
  };

  if (!authenticated) {
    return <Alert showIcon type="info" message="创作者中心" description="登录账户后可以查看课程申请入口。" />;
  }
  if (!accountAddress) {
    return <Alert showIcon type="info" message="创作者中心" description="课程提交需要连接外部钱包；请在右上角账户菜单中连接钱包。" />;
  }

  return (
    <Row gutter={24} align="top">
      {/* 左侧：提交表单 */}
      <Col xs={24} lg={16}>
        <Card title="提交课程资料" bordered={false}>
          <Form form={form} layout="vertical" requiredMark="optional">
            <Form.Item name="title" label="课程名称" rules={[{ required: true, message: '请输入课程名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="summary" label="一句话简介" rules={[{ required: true, message: '请输入简介' }]}>
              <Input showCount maxLength={180} />
            </Form.Item>
            <Form.Item name="description" label="详细介绍" rules={[{ required: true, message: '请输入详细介绍' }]}>
              <Input.TextArea rows={5} showCount maxLength={2000} />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="category" label="分类" rules={[{ required: true, message: '请输入分类' }]}>
                  <Input placeholder="Solidity / DeFi" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="certificateName" label="证书名称" rules={[{ required: true, message: '请输入证书名称' }]}>
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="videoUrl" label="视频 URL" rules={[{ required: true, message: '请输入视频 URL' }]}>
              <Input placeholder="https://..." />
            </Form.Item>
            <Form.Item name="coverUrl" label="封面 URL" rules={[{ required: true, message: '请输入封面 URL' }]}>
              <Input placeholder="https://..." />
            </Form.Item>
            <Button type="primary" loading={submitting} onClick={() => void submit()}>
              签名并提交上架申请
            </Button>
          </Form>
        </Card>
      </Col>

      {/* 右侧：我的课程申请 */}
      <Col xs={24} lg={8}>
        <Card title="我的课程申请" bordered={false}>
          {requests.length === 0 ? (
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
                      {new Date(req.created_at).toLocaleDateString('zh-CN')}
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
  );
}

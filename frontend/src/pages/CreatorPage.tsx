import { useState } from 'react';
import { Alert, Button, Card, Form, Input, InputNumber, Space, Typography, message } from 'antd';
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

export default function CreatorPage() {
  const { address } = useAccount();
  const { authenticated } = usePrivy();
  const { signTypedData } = useSignTypedData();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!authenticated || !address) {
      message.info('请先使用 Privy 登录钱包');
      return;
    }
    const values = await form.validateFields() as {
      courseId: number;
      title: string;
      description: string;
      coverUrl: string;
      videoUrls: string;
    };
    setSubmitting(true);
    try {
      const timestamp = Date.now();
      const signature = await signTypedData({
        domain: EIP712_DOMAIN,
        types: EIP712_TYPES,
        primaryType: 'Action',
        message: { action: 'submitCourse', address: address as `0x${string}`, timestamp: BigInt(timestamp) },
      });
      const response = await fetch(`${API_BASE}/api/courses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          videoUrls: values.videoUrls.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean),
          address,
          timestamp,
          signature,
        }),
      });
      if (!response.ok) throw new Error('课程提交失败');
      message.success('课程申请已提交，等待 Owner 审核');
      form.resetFields();
    } catch (error) {
      const text = error instanceof Error ? error.message : '课程提交失败';
      message.error(text.includes('rejected') ? '用户取消了签名' : text);
    } finally {
      setSubmitting(false);
    }
  };

  if (!authenticated || !address) {
    return <Alert showIcon type="info" message="创作者中心" description="连接 Privy 钱包后，可提交课程申请并查看审核状态。" />;
  }

  return (
    <div className="creator-page">
      <Title level={2}>创作者中心</Title>
      <Text type="secondary">老师 / 商家提交课程资料，由 Owner 上链审核后发布。</Text>
      <Card title="提交课程申请" style={{ marginTop: 24, maxWidth: 760 }}>
        <Form form={form} layout="vertical">
          <Form.Item name="courseId" label="课程 ID" rules={[{ required: true, message: '请输入课程 ID' }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="title" label="课程标题" rules={[{ required: true, message: '请输入课程标题' }]}><Input /></Form.Item>
          <Form.Item name="description" label="课程简介" rules={[{ required: true, message: '请输入课程简介' }]}><Input.TextArea rows={4} /></Form.Item>
          <Form.Item name="coverUrl" label="封面 URL" rules={[{ required: true, message: '请输入封面 URL' }]}><Input placeholder="https://..." /></Form.Item>
          <Form.Item name="videoUrls" label="视频 URL（每行一个）" rules={[{ required: true, message: '请输入视频 URL' }]}><Input.TextArea rows={4} placeholder="https://..." /></Form.Item>
          <Space><Button type="primary" loading={submitting} onClick={() => void submit()}>签名并提交</Button><Text type="secondary">提交后由 Owner 调用 CourseMarket.publishCourse</Text></Space>
        </Form>
      </Card>
    </div>
  );
}

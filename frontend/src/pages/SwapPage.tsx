import { useState, useCallback } from 'react';
import { useAccount, useReadContract, usePublicClient, useWalletClient } from 'wagmi';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  InputNumber,
  message,
  Space,
  Steps,
  Tag,
  Typography,
} from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import { formatUnits, parseUnits } from 'viem';
import { waitForTransactionReceipt } from 'viem/actions';

import { ydTokenAbi, mockUsdcAbi, swapRouterAbi } from '@/contracts/abis';
import {
  YD_TOKEN_ADDRESS,
  MOCK_USDC_ADDRESS,
  SWAP_ROUTER_ADDRESS,
} from '@/contracts/addresses';

const { Title, Text } = Typography;

// Uniswap V3 pool fee tier: 0.3%
const POOL_FEE = 3000;
// 20 minutes deadline from now
const DEADLINE_OFFSET = 20 * 60;

type SwapStep = 'idle' | 'approving' | 'swapping' | 'done' | 'error';

const SWAP_STEPS = [
  { title: '授权 USDC' },
  { title: '执行兑换' },
  { title: '完成' },
];

function getSwapStepIndex(step: SwapStep): number {
  const map: Record<SwapStep, number> = {
    idle: 0,
    approving: 0,
    swapping: 1,
    done: 2,
    error: 0,
  };
  return map[step];
}

export default function SwapPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [usdcAmount, setUsdcAmount] = useState<string>('');
  const [swapStep, setSwapStep] = useState<SwapStep>('idle');
  const [faucetLoading, setFaucetLoading] = useState(false);

  const { data: ydBalance, refetch: refetchYd } = useReadContract({
    address: YD_TOKEN_ADDRESS,
    abi: ydTokenAbi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!address },
  });

  const { data: usdcBalance, refetch: refetchUsdc } = useReadContract({
    address: MOCK_USDC_ADDRESS,
    abi: mockUsdcAbi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!address },
  });

  // Faucet: claim test USDC
  const handleFaucet = useCallback(async () => {
    if (!address || !publicClient || !walletClient) {
      message.error('请先连接钱包');
      return;
    }
    setFaucetLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wc = walletClient as any;
    try {
      const amount = parseUnits('1000', 6);
      const hash = (await wc.writeContract({
        address: MOCK_USDC_ADDRESS,
        abi: mockUsdcAbi,
        functionName: 'faucet',
        args: [amount],
      })) as `0x${string}`;
      await waitForTransactionReceipt(publicClient, { hash });
      message.success('领取 1,000 USDC 成功！');
      void refetchUsdc();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '领取失败';
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        message.error('用户取消了交易');
      } else {
        message.error(`领取失败：${msg.slice(0, 80)}`);
      }
    } finally {
      setFaucetLoading(false);
    }
  }, [address, publicClient, walletClient, refetchUsdc]);

  // USDC → YD swap via Uniswap V3 exactInputSingle
  const handleSwap = useCallback(async () => {
    if (!address || !publicClient || !walletClient) {
      message.error('请先连接钱包');
      return;
    }
    if (!usdcAmount || Number(usdcAmount) <= 0) {
      message.error('请输入兑换数量');
      return;
    }

    const amountIn = parseUnits(usdcAmount, 6);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wc = walletClient as any;

    try {
      // Step 1: approve USDC to SwapRouter (serial — wait for receipt)
      setSwapStep('approving');
      const allowance = await publicClient.readContract({
        address: MOCK_USDC_ADDRESS,
        abi: mockUsdcAbi,
        functionName: 'allowance',
        args: [address, SWAP_ROUTER_ADDRESS],
      });

      if (allowance < amountIn) {
        const approveHash = (await wc.writeContract({
          address: MOCK_USDC_ADDRESS,
          abi: mockUsdcAbi,
          functionName: 'approve',
          args: [SWAP_ROUTER_ADDRESS, amountIn],
        })) as `0x${string}`;
        await waitForTransactionReceipt(publicClient, { hash: approveHash });
      }

      // Step 2: exactInputSingle swap
      setSwapStep('swapping');
      // amountOutMinimum = 0 for testnet; production must use price oracle
      const amountOutMinimum = 0n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_OFFSET);

      const swapHash = (await wc.writeContract({
        address: SWAP_ROUTER_ADDRESS,
        abi: swapRouterAbi,
        functionName: 'exactInputSingle',
        args: [
          {
            tokenIn: MOCK_USDC_ADDRESS,
            tokenOut: YD_TOKEN_ADDRESS,
            fee: POOL_FEE,
            recipient: address,
            deadline,
            amountIn,
            amountOutMinimum,
            sqrtPriceLimitX96: 0n,
          },
        ],
      })) as `0x${string}`;
      await waitForTransactionReceipt(publicClient, { hash: swapHash });

      setSwapStep('done');
      message.success('兑换成功！');
      setUsdcAmount('');
      void refetchYd();
      void refetchUsdc();
    } catch (err: unknown) {
      setSwapStep('error');
      const msg = err instanceof Error ? err.message : '兑换失败';
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        message.error('用户取消了交易');
      } else {
        message.error(`兑换失败：${msg.slice(0, 80)}`);
      }
    }
  }, [address, publicClient, walletClient, usdcAmount, refetchYd, refetchUsdc]);

  const isSwapping = swapStep === 'approving' || swapStep === 'swapping';

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <Title level={2}>代币兑换</Title>
      <Text type="secondary">使用 MockUSDC 在 Uniswap V3 上兑换 YD 代币</Text>

      <Card style={{ marginTop: 24 }}>
        <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="YD 余额">
            <Tag color="blue">
              {ydBalance !== undefined
                ? `${Number(formatUnits(ydBalance as bigint, 18)).toFixed(4)} YD`
                : '--'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="USDC 余额">
            <Tag color="green">
              {usdcBalance !== undefined
                ? `${Number(formatUnits(usdcBalance as bigint, 6)).toFixed(2)} USDC`
                : '--'}
            </Tag>
          </Descriptions.Item>
        </Descriptions>

        <Divider />

        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Text strong>测试水龙头</Text>
          <Button
            onClick={() => void handleFaucet()}
            loading={faucetLoading}
            disabled={!address}
          >
            领取 1,000 USDC
          </Button>
        </Space>

        <Divider />

        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Text strong>USDC → YD 兑换</Text>

          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              输入 USDC 数量
            </Text>
            <InputNumber
              value={usdcAmount}
              onChange={(v) => setUsdcAmount(v?.toString() ?? '')}
              placeholder="输入 USDC 数量"
              min="0"
              style={{ width: '100%' }}
              addonAfter="USDC"
              stringMode
            />
          </div>

          {swapStep !== 'idle' && swapStep !== 'error' && (
            <Steps
              current={getSwapStepIndex(swapStep)}
              items={SWAP_STEPS}
              size="small"
              style={{ marginTop: 8 }}
            />
          )}

          {swapStep === 'error' && (
            <Alert type="error" message="兑换失败，请重试" showIcon />
          )}

          <Space>
            <Button
              type="primary"
              icon={<SwapOutlined />}
              loading={isSwapping}
              disabled={!address || !usdcAmount || Number(usdcAmount) <= 0}
              onClick={() => void handleSwap()}
            >
              {isSwapping ? '兑换中...' : '立即兑换'}
            </Button>
            {(swapStep === 'done' || swapStep === 'error') && (
              <Button onClick={() => setSwapStep('idle')}>重置</Button>
            )}
          </Space>

          {swapStep === 'done' && (
            <Alert type="success" message="兑换成功，YD 余额已更新" showIcon />
          )}
        </Space>

        <Divider />
        <Text type="secondary" style={{ fontSize: 11 }}>
          注意：测试网络使用 MockUSDC。兑换路径：USDC → YD，手续费 0.3%。
          amountOutMinimum 在测试网设为 0，生产环境需加价格预言机保护。
        </Text>
      </Card>
    </div>
  );
}

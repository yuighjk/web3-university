import { useCallback, useEffect, useState } from 'react';
import { useAccount, useBalance, usePublicClient, useReadContract, useWalletClient } from 'wagmi';
import { Alert, Button, Card, Col, InputNumber, message, Row, Segmented, Space, Steps, Tag, Typography } from 'antd';
import { ArrowDownOutlined, GiftOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { formatUnits, parseUnits, zeroAddress } from 'viem';
import { waitForTransactionReceipt } from 'viem/actions';

import { mockUsdcAbi, swapRouterAbi, testTokenFaucetAbi, ydTokenAbi } from '@/contracts/abis';
import { MOCK_USDC_ADDRESS, SWAP_ROUTER_ADDRESS, TEST_TOKEN_FAUCET_ADDRESS, YD_TOKEN_ADDRESS } from '@/contracts/addresses';

const { Title, Text } = Typography;
const POOL_FEE = 3000;
const DEADLINE_OFFSET = 20 * 60;
const COOLDOWN_SECONDS = 24 * 60 * 60;
const formatCountdown = (seconds: number) => `${Math.floor(seconds / 3600)}时 ${Math.floor((seconds % 3600) / 60)}分 ${seconds % 60}秒`;

export default function SwapPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [inputAmount, setInputAmount] = useState('');
  const [inputToken, setInputToken] = useState<'mUSDC' | 'ETH'>('mUSDC');
  const [claimToken, setClaimToken] = useState<'mUSDC' | 'YD'>('mUSDC');
  const [swapping, setSwapping] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [swapStep, setSwapStep] = useState(0);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const faucetConfigured = TEST_TOKEN_FAUCET_ADDRESS !== zeroAddress;
  const readAddress = address ?? zeroAddress;

  useEffect(() => {
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: ethBalance } = useBalance({ address, query: { enabled: !!address } });
  const { data: ydBalance, refetch: refetchYd } = useReadContract({ address: YD_TOKEN_ADDRESS, abi: ydTokenAbi, functionName: 'balanceOf', args: [readAddress], query: { enabled: !!address } });
  const { data: usdcBalance, refetch: refetchUsdc } = useReadContract({ address: MOCK_USDC_ADDRESS, abi: mockUsdcAbi, functionName: 'balanceOf', args: [readAddress], query: { enabled: !!address } });
  const { data: faucetUsdcReserve, refetch: refetchFaucetUsdc } = useReadContract({ address: MOCK_USDC_ADDRESS, abi: mockUsdcAbi, functionName: 'balanceOf', args: [TEST_TOKEN_FAUCET_ADDRESS], query: { enabled: faucetConfigured } });
  const { data: faucetYdReserve, refetch: refetchFaucetYd } = useReadContract({ address: YD_TOKEN_ADDRESS, abi: ydTokenAbi, functionName: 'balanceOf', args: [TEST_TOKEN_FAUCET_ADDRESS], query: { enabled: faucetConfigured } });
  const { data: lastClaimAt, refetch: refetchLastClaim } = useReadContract({ address: TEST_TOKEN_FAUCET_ADDRESS, abi: testTokenFaucetAbi, functionName: 'lastClaimAt', args: [readAddress], query: { enabled: faucetConfigured && !!address } });

  const remainingSeconds = Math.max(0, Number(lastClaimAt ?? 0n) + COOLDOWN_SECONDS - nowSeconds);
  const canClaim = faucetConfigured && !!address && remainingSeconds === 0;
  const estimatedOutput = inputAmount && Number(inputAmount) > 0 ? inputToken === 'mUSDC' ? Number(inputAmount).toFixed(2) : (Number(inputAmount) * 2000).toFixed(2) : '0.00';
  const paymentBalance = inputToken === 'mUSDC' ? usdcBalance === undefined ? '--' : Number(formatUnits(usdcBalance, 6)).toFixed(2) : ethBalance ? Number(formatUnits(ethBalance.value, ethBalance.decimals)).toFixed(5) : '--';

  const handleFaucet = useCallback(async () => {
    if (!faucetConfigured) return message.info('新水龙头合约尚未部署到 Sepolia');
    if (!address || !publicClient || !walletClient) return message.error('请先连接钱包');
    if (!canClaim) return message.warning(`距离下次领取还有 ${formatCountdown(remainingSeconds)}`);
    setFaucetLoading(true);
    try {
      const hash = await walletClient.writeContract({ address: TEST_TOKEN_FAUCET_ADDRESS, abi: testTokenFaucetAbi, functionName: 'claim', args: [claimToken === 'YD'] });
      await waitForTransactionReceipt(publicClient, { hash });
      message.success(`已领取 100 ${claimToken}`);
      await Promise.all([refetchYd(), refetchUsdc(), refetchFaucetUsdc(), refetchFaucetYd(), refetchLastClaim()]);
    } catch (error) {
      const text = error instanceof Error ? error.message : '领取失败';
      message.error(text.toLowerCase().includes('reject') ? '用户取消了交易' : `领取失败：${text.slice(0, 80)}`);
    } finally { setFaucetLoading(false); }
  }, [address, canClaim, claimToken, faucetConfigured, publicClient, refetchFaucetUsdc, refetchFaucetYd, refetchLastClaim, refetchUsdc, refetchYd, remainingSeconds, walletClient]);

  const handleSwap = useCallback(async () => {
    if (!address || !publicClient || !walletClient) return message.error('请先连接钱包');
    if (inputToken === 'ETH') return message.info('ETH → YD 需要先部署 WETH/YD Uniswap 池，当前不会发送无效交易');
    if (!inputAmount || Number(inputAmount) <= 0) return message.error('请输入兑换数量');
    const amountIn = parseUnits(inputAmount, 6);
    if (usdcBalance !== undefined && amountIn > usdcBalance) return message.error('mUSDC 余额不足');
    setSwapping(true);
    try {
      setSwapStep(0);
      const allowance = await publicClient.readContract({ address: MOCK_USDC_ADDRESS, abi: mockUsdcAbi, functionName: 'allowance', args: [address, SWAP_ROUTER_ADDRESS] });
      if (allowance < amountIn) {
        const approveHash = await walletClient.writeContract({ address: MOCK_USDC_ADDRESS, abi: mockUsdcAbi, functionName: 'approve', args: [SWAP_ROUTER_ADDRESS, amountIn] });
        await waitForTransactionReceipt(publicClient, { hash: approveHash });
      }
      setSwapStep(1);
      const swapHash = await walletClient.writeContract({ address: SWAP_ROUTER_ADDRESS, abi: swapRouterAbi, functionName: 'exactInputSingle', args: [{ tokenIn: MOCK_USDC_ADDRESS, tokenOut: YD_TOKEN_ADDRESS, fee: POOL_FEE, recipient: address, deadline: BigInt(Math.floor(Date.now() / 1000) + DEADLINE_OFFSET), amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }] });
      await waitForTransactionReceipt(publicClient, { hash: swapHash });
      setSwapStep(2);
      setInputAmount('');
      message.success('兑换完成，余额已更新');
      await Promise.all([refetchYd(), refetchUsdc()]);
    } catch (error) {
      const text = error instanceof Error ? error.message : '兑换失败';
      message.error(text.toLowerCase().includes('reject') ? '用户取消了交易' : `兑换失败：${text.slice(0, 80)}`);
    } finally { setSwapping(false); }
  }, [address, inputAmount, inputToken, publicClient, refetchUsdc, refetchYd, usdcBalance, walletClient]);

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}><Title level={2} style={{ marginBottom: 6 }}>获取与兑换 YD</Title><Text type="secondary">测试代币不会因登录自动发放。先连接钱包，再领取或使用资产兑换。</Text></div>
      <Row gutter={[20, 20]} align="stretch">
        <Col xs={24} lg={9}>
          <Card className="token-faucet-card" style={{ height: '100%' }}>
            <Space direction="vertical" size={18} style={{ width: '100%' }}>
              <div><Tag icon={<GiftOutlined />} color="purple">测试网水龙头</Tag><Title level={4} style={{ margin: '12px 0 4px' }}>领取测试代币</Title><Text type="secondary">每个钱包每 24 小时只能二选一领取 100 个。</Text></div>
              <Segmented block options={['mUSDC', 'YD']} value={claimToken} onChange={(value) => setClaimToken(value as 'mUSDC' | 'YD')} />
              <div className="faucet-reserve-grid"><div><span>mUSDC 剩余</span><strong>{faucetConfigured && faucetUsdcReserve !== undefined ? Number(formatUnits(faucetUsdcReserve, 6)).toFixed(0) : '--'}</strong></div><div><span>YD 剩余</span><strong>{faucetConfigured && faucetYdReserve !== undefined ? Number(formatUnits(faucetYdReserve, 18)).toFixed(0) : '--'}</strong></div></div>
              {!faucetConfigured && <Alert type="warning" showIcon message="新水龙头待部署" description="旧合约可无限增发，已从页面停用。部署新合约并配置地址后即可领取。" />}
              {remainingSeconds > 0 && <Alert type="info" showIcon message={`下次可领取：${formatCountdown(remainingSeconds)}`} />}
              <Button className="faucet-claim-button" type="primary" block size="large" loading={faucetLoading} disabled={!canClaim} onClick={() => void handleFaucet()}>领取 100 {claimToken}</Button>
              <Text type="secondary" style={{ fontSize: 11 }}>初始储备各 9,900 个，由水龙头合约转账，不会凭空增发。</Text>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={15}>
          <Card className="token-swap-card">
            <div className="swap-rate-strip"><div><span>参考比例</span><strong>1 mUSDC = 1 YD</strong></div><div><span>目标参考</span><strong>1 ETH = 2,000 YD</strong></div></div>
            <Alert icon={<InfoCircleOutlined />} type="info" showIcon message="链上成交价以 Uniswap 池状态为准；参考比例不是系统强制固定价格。" style={{ marginBottom: 18 }} />
            <div className="swap-token-panel"><div className="swap-panel-heading"><span>你支付</span><small>余额 {paymentBalance} {inputToken}</small></div><div className="swap-input-row"><InputNumber stringMode controls={false} min="0" value={inputAmount} onChange={(value) => setInputAmount(value?.toString() ?? '')} placeholder="0.00" /><Segmented options={['mUSDC', 'ETH']} value={inputToken} onChange={(value) => { setInputToken(value as 'mUSDC' | 'ETH'); setSwapStep(0); }} /></div></div>
            <div className="swap-direction"><ArrowDownOutlined /></div>
            <div className="swap-token-panel output"><div className="swap-panel-heading"><span>预计获得</span><small>YD 余额 {ydBalance === undefined ? '--' : Number(formatUnits(ydBalance, 18)).toFixed(2)}</small></div><div className="swap-output-value">{estimatedOutput}<b>YD</b></div></div>
            <Steps size="small" current={swapStep} items={[{ title: '授权 mUSDC' }, { title: 'Uniswap 兑换' }, { title: '余额更新' }]} style={{ margin: '22px 0' }} />
            {inputToken === 'ETH' && <Alert type="warning" showIcon message="ETH 路径尚未上链" description="需要新增 WETH/YD Uniswap 池与流动性。页面保留目标汇率说明，但不会伪造兑换结果。" style={{ marginBottom: 16 }} />}
            <Button type="primary" block size="large" loading={swapping} disabled={!address || !inputAmount || Number(inputAmount) <= 0 || inputToken === 'ETH'} onClick={() => void handleSwap()} style={{ borderRadius: 10, height: 48, fontSize: 15, fontWeight: 600, ...( (!address || !inputAmount || Number(inputAmount) <= 0 || inputToken === 'ETH') && !swapping ? { background: '#e0e0e0', borderColor: '#e0e0e0', color: '#666' } : {}) }}>{!address ? '连接钱包后兑换' : inputToken === 'ETH' ? 'ETH 路径待部署' : `用 ${inputAmount || '0'} mUSDC 兑换 YD`}</Button>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

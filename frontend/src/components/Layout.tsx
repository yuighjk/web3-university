import { useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Input,
  Layout as AntLayout,
  Menu,
  Modal,
  Popover,
  Tag,
  message,
} from 'antd';
import {
  EditOutlined,
  GoogleOutlined,
  LogoutOutlined,
  MailOutlined,
  QuestionCircleOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLoginWithEmail, usePrivy, useWallets } from '@privy-io/react-auth';
import { useAccount, useReadContract } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';

import { mockUsdcAbi, ydTokenAbi } from '@/contracts/abis';
import { MOCK_USDC_ADDRESS, YD_TOKEN_ADDRESS } from '@/contracts/addresses';

const { Header, Content, Footer, Sider } = AntLayout;
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface LayoutProfile {
  username: string | null;
  avatarUrl: string | null;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, connectWallet, logout, authenticated, ready, user } = usePrivy();
  const { sendCode, loginWithCode, state: emailLoginState } = useLoginWithEmail();
  const { address } = useAccount();
  const { wallets } = useWallets();
  const accountAddress = address ?? (user?.wallet?.address as `0x${string}` | undefined);
  const [loginOpen, setLoginOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const { data: profile } = useQuery<LayoutProfile>({
    queryKey: ['layout-profile', accountAddress],
    enabled: !!accountAddress,
    retry: 0,
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/users/${accountAddress}`);
      if (!response.ok) return { username: null, avatarUrl: null };
      const payload = (await response.json()) as {
        data: { username: string | null; avatarUrl?: string | null; avatar_url?: string | null };
      };
      return {
        username: payload.data.username,
        avatarUrl: payload.data.avatarUrl ?? payload.data.avatar_url ?? null,
      };
    },
  });

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [profile?.avatarUrl]);
  const balanceAddress = accountAddress ?? '0x0000000000000000000000000000000000000000';
  const { data: ydBalance } = useReadContract({
    address: YD_TOKEN_ADDRESS,
    abi: ydTokenAbi,
    functionName: 'balanceOf',
    args: [balanceAddress],
    query: { enabled: authenticated && !!accountAddress },
  });
  const { data: usdcBalance } = useReadContract({
    address: MOCK_USDC_ADDRESS,
    abi: mockUsdcAbi,
    functionName: 'balanceOf',
    args: [balanceAddress],
    query: { enabled: authenticated && !!accountAddress },
  });

  const selectedKey = location.pathname.startsWith('/course') || location.pathname === '/'
    ? '/'
    : location.pathname === '/admin' ? '/owner' : location.pathname;
  const menuItems = [
    { key: '/', icon: <ReadOutlined />, label: <Link to="/">课程市场</Link> },
    { key: '/swap', icon: <SwapOutlined />, label: <Link to="/swap">兑换 YD</Link> },
    { key: '/creator', icon: <EditOutlined />, label: <Link to="/creator">创作者中心</Link> },
    { key: '/profile', icon: <UserOutlined />, label: <Link to="/profile">个人中心</Link> },
    { key: '/owner', icon: <SafetyCertificateOutlined />, label: <Link to="/owner">Owner 管理台</Link> },
  ];
  const shortAddress = accountAddress ? `${accountAddress.slice(0, 6)}...${accountAddress.slice(-4)}` : '学生账户';
  const accountName = authenticated ? (profile?.username || user?.email?.address || shortAddress) : '学生账户';
  const accountAvatarUrl = authenticated && !avatarLoadFailed ? profile?.avatarUrl ?? undefined : undefined;
  const externalWallet = wallets.find((wallet) => wallet.walletClientType !== 'privy');
  const walletConnected = !!externalWallet;
  const walletDisplayAddress = externalWallet?.address ? `${externalWallet.address.slice(0, 6)}...${externalWallet.address.slice(-4)}` : '';

  const openWalletConnection = () => {
    setAccountOpen(false);
    setLoginOpen(false);
    if (authenticated) {
      connectWallet();
    } else {
      // Before authentication, `connectWallet()` only links a wallet to an
      // existing Privy user and may not open the selector. Wallet login is the
      // correct entry point and still presents the wallet-selection modal.
      login({ loginMethods: ['wallet'] });
    }
  };

  const goToCourses = () => {
    navigate('/');
    window.setTimeout(() => document.getElementById('course-market')?.scrollIntoView({ behavior: 'smooth' }), 0);
  };

  const openLogin = () => {
    setAccountOpen(false);
    setLoginCode('');
    setLoginOpen(true);
  };
  const sendEmailCode = async () => {
    if (!/^\S+@\S+\.\S+$/.test(loginEmail)) {
      message.warning('请输入正确的邮箱地址');
      return;
    }
    try {
      await sendCode({ email: loginEmail });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '验证码发送失败');
    }
  };
  const verifyEmailCode = async () => {
    if (!loginCode.trim()) {
      message.warning('请输入邮箱验证码');
      return;
    }
    try {
      await loginWithCode({ code: loginCode.trim() });
      setLoginOpen(false);
      setLoginCode('');
      message.success('登录成功');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '验证码错误');
    }
  };

  const awaitingCode = emailLoginState.status === 'awaiting-code-input' || emailLoginState.status === 'submitting-code';
  const accountPanel = (
    <div className="account-popover-card">
      <div className="account-popover-heading">
        <Avatar
          size={42}
          src={accountAvatarUrl}
          icon={!accountAvatarUrl ? <UserOutlined /> : undefined}
          onError={() => { setAvatarLoadFailed(true); return false; }}
        />
        <div>
          <strong>{accountName}</strong>
          <span>{authenticated ? (accountAddress ? shortAddress : '钱包未连接') : '尚未登录账户'}</span>
        </div>
      </div>
      <button
        type="button"
        className="profile-row"
        disabled={!authenticated}
        onClick={() => { setAccountOpen(false); navigate('/profile'); }}
      >
        <span><EditOutlined /> 昵称与头像</span>
        <strong>{authenticated ? '编辑 →' : '登录后编辑'}</strong>
      </button>
      {!authenticated && <div className="account-login-note">登录后可修改昵称、查看个人学习记录</div>}
      <div className="account-balance-grid">
        <div className="balance-row"><span>YD 额度</span><strong>{ydBalance === undefined ? '--' : Number(formatUnits(ydBalance, 18)).toFixed(4)}</strong></div>
        <div className="balance-row"><span>mUSDC 余额</span><strong>{usdcBalance === undefined ? '--' : Number(formatUnits(usdcBalance, 6)).toFixed(2)}</strong></div>
      </div>
      <div className="wallet-state"><span>钱包状态</span><strong className={walletConnected ? 'is-connected' : ''}>{walletConnected ? `已连接 ${walletDisplayAddress}` : '钱包未连接'}</strong></div>
      {!authenticated && <Button type="primary" block onClick={openLogin}>登录账户</Button>}
      {!walletConnected && <Button block icon={<WalletOutlined />} onClick={openWalletConnection}>连接钱包</Button>}
      {authenticated && <Button block icon={<LogoutOutlined />} onClick={() => { setAccountOpen(false); void logout(); }}>退出登录</Button>}
    </div>
  );

  return (
    <AntLayout className="app-shell academic-shell">
      <Sider width={256} className="app-sider academic-sider" theme="light">
        <Link to="/" className="academic-brand">
          <strong>Web3 大学</strong>
          <span>ACADEMIC LEDGER</span>
        </Link>
        <Menu mode="inline" selectedKeys={[selectedKey]} items={menuItems} className="app-menu academic-menu" />
        <div className="academic-sider-footer">
          <Button block className="enroll-button" onClick={goToCourses}>立即选课</Button>
          <Button type="text" block icon={<QuestionCircleOutlined />} className="footer-nav-button" onClick={goToCourses}>课程帮助</Button>
        </div>
      </Sider>

      <AntLayout className="main-layout">
        <Header className="app-header academic-header">
          <div className="network-status">
            <Tag>Ethereum Sepolia</Tag>
            <Tag className="contract-status"><span />{walletConnected ? '钱包已连接' : '钱包未连接'}</Tag>
          </div>
          <div className="header-actions">
            <Popover
              content={accountPanel}
              trigger="click"
              placement="bottomRight"
              open={accountOpen}
              onOpenChange={setAccountOpen}
              overlayClassName="account-popover"
            >
              <button className="header-account-button" aria-label="打开账户操作">
                <Avatar
                  size={34}
                  src={accountAvatarUrl}
                  icon={!accountAvatarUrl ? <UserOutlined /> : undefined}
                  onError={() => { setAvatarLoadFailed(true); return false; }}
                />
                <span className="header-account-copy"><strong>{authenticated ? accountName : '学生账户'}</strong><small>{!ready ? '初始化中…' : !authenticated ? '未登录' : walletConnected ? '钱包已连接' : '钱包未连接'}</small></span>
                <span className="header-account-caret">⌄</span>
              </button>
            </Popover>
          </div>
        </Header>
        <Content className="app-content academic-content">{children}</Content>
        <Footer className="app-footer">WEB3 UNIVERSITY · SEPOLIA ACADEMIC LEDGER</Footer>
      </AntLayout>

      <Modal title="连接 Web3 大学账户" open={loginOpen} onCancel={() => setLoginOpen(false)} footer={null} centered className="academic-login-modal">
        <p className="login-description">使用邮箱验证码登录。首次登录会为你创建用于购买课程与领取证书的 Privy 钱包。</p>
        {emailLoginState.status === 'error' && <Alert type="error" showIcon message={emailLoginState.error?.message || '登录失败，请重试'} />}
        {awaitingCode ? (
          <div className="email-login-form">
            <div className="email-login-row otp-login-row">
              <div className="otp-input-wrap">
                <MailOutlined />
                <Input.OTP length={6} value={loginCode} onChange={setLoginCode} autoFocus />
              </div>
              <Button type="primary" loading={emailLoginState.status === 'submitting-code'} onClick={() => void verifyEmailCode()}>验证登录</Button>
            </div>
            <div className="otp-hint">验证码已发送至 {loginEmail} · <Button type="link" onClick={() => void sendEmailCode()}>重新发送</Button></div>
          </div>
        ) : (
          <div className="email-login-form">
            <div className="email-login-row">
              <Input type="email" prefix={<MailOutlined />} value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} onPressEnter={() => void sendEmailCode()} placeholder="your@email.com" autoFocus />
              <Button type="primary" loading={emailLoginState.status === 'sending-code'} onClick={() => void sendEmailCode()}>发送验证码</Button>
            </div>
            <div className="login-options">
              <Button className="social-login-button" icon={<GoogleOutlined />} onClick={() => { setLoginOpen(false); login({ loginMethods: ['google'] }); }}>使用 Google 登录</Button>
              <Button className="wallet-login-button" icon={<WalletOutlined />} onClick={openWalletConnection}>连接钱包</Button>
            </div>
          </div>
        )}
      </Modal>
    </AntLayout>
  );
}

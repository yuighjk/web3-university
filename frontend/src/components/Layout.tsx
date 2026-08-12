import { Layout as AntLayout, Menu, Button, Space, Typography, Dropdown } from 'antd';
import { UserOutlined, SwapOutlined, BookOutlined, SettingOutlined } from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';

const { Header, Content, Footer } = AntLayout;
const { Text } = Typography;

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, logout, authenticated, ready } = usePrivy();
  const { address } = useAccount();

  const selectedKey = (() => {
    if (location.pathname.startsWith('/course')) return '/';
    if (location.pathname === '/swap') return '/swap';
    if (location.pathname === '/profile') return '/profile';
    if (location.pathname === '/admin') return '/admin';
    return location.pathname;
  })();

  const menuItems = [
    {
      key: '/',
      icon: <BookOutlined />,
      label: <Link to="/">课程</Link>,
    },
    {
      key: '/swap',
      icon: <SwapOutlined />,
      label: <Link to="/swap">兑换</Link>,
    },
    {
      key: '/profile',
      icon: <UserOutlined />,
      label: <Link to="/profile">个人中心</Link>,
    },
    {
      key: '/admin',
      icon: <SettingOutlined />,
      label: <Link to="/admin">管理后台</Link>,
    },
  ];

  const accountMenuItems = [
    {
      key: 'profile',
      label: '个人中心',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'logout',
      label: '退出登录',
      danger: true,
      onClick: () => logout(),
    },
  ];

  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : '';

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          background: '#141414',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <Space align="center" size={32}>
          <Link to="/" style={{ color: '#fff', fontWeight: 700, fontSize: 18, textDecoration: 'none' }}>
            易灯 Web3 大学
          </Link>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[selectedKey]}
            items={menuItems}
            style={{ background: 'transparent', borderBottom: 'none', minWidth: 320 }}
          />
        </Space>

        <Space>
          {!ready ? null : authenticated && address ? (
            <Dropdown menu={{ items: accountMenuItems }} placement="bottomRight">
              <Button type="text" style={{ color: '#fff' }}>
                <UserOutlined /> <Text style={{ color: '#fff' }}>{shortAddress}</Text>
              </Button>
            </Dropdown>
          ) : (
            <Button type="primary" onClick={login}>
              连接钱包 / 登录
            </Button>
          )}
        </Space>
      </Header>

      <Content style={{ padding: '24px 48px', flex: 1 }}>
        {children}
      </Content>

      <Footer style={{ textAlign: 'center', background: '#141414', color: '#666' }}>
        易灯 Web3 大学 ©{new Date().getFullYear()} — 区块链教育平台
      </Footer>
    </AntLayout>
  );
}

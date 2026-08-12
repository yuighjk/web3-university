import { Layout as AntLayout, Menu, Button, Space, Typography, Dropdown, Tag } from 'antd';
import {
  UserOutlined,
  SwapOutlined,
  BookOutlined,
  ShopOutlined,
  CrownOutlined,
  MenuFoldOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { useState } from 'react';

const { Header, Content, Footer, Sider } = AntLayout;
const { Text } = Typography;

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, logout, authenticated, ready } = usePrivy();
  const { address } = useAccount();
  const [collapsed, setCollapsed] = useState(false);

  const selectedKey = location.pathname.startsWith('/course') || location.pathname === '/'
    ? '/'
    : location.pathname === '/admin'
      ? '/owner'
      : location.pathname;
  const menuItems = [
    { key: '/', icon: <BookOutlined />, label: <Link to="/">课程市场</Link> },
    { key: '/swap', icon: <SwapOutlined />, label: <Link to="/swap">兑换 YD</Link> },
    { key: '/creator', icon: <ShopOutlined />, label: <Link to="/creator">创作者中心</Link> },
    { key: '/profile', icon: <UserOutlined />, label: <Link to="/profile">个人中心</Link> },
    { key: '/owner', icon: <CrownOutlined />, label: <Link to="/admin">Owner 管理台</Link> },
  ];

  const accountMenuItems = [
    { key: 'profile', label: '个人中心', onClick: () => navigate('/profile') },
    { key: 'logout', label: '退出登录', danger: true, onClick: () => logout() },
  ];

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';

  return (
    <AntLayout className="app-shell">
      <Sider
        width={220}
        collapsedWidth={64}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        className="app-sider"
        theme="light"
        trigger={null}
      >
        <div className="brand-block">
          <Link to="/" className="brand-link">
            <span className="brand-mark"><ExperimentOutlined /></span>
            <span className="brand-copy">
              <span className="brand-title">Web3 大学</span>
              <span className="brand-subtitle">Learn&nbsp; · &nbsp;Own&nbsp; · &nbsp;Build</span>
            </span>
          </Link>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          className="app-menu"
        />
        <div className="sider-bottom">
          <Button type="text" block className="collapse-button" aria-label={collapsed ? '展开侧栏' : '收起侧栏'} onClick={() => setCollapsed((value) => !value)}>
            <MenuFoldOutlined rotate={collapsed ? 180 : 0} />
          </Button>
        </div>
      </Sider>

      <AntLayout className="main-layout">
        <Header className="app-header">
          <Space size={10}>
            <Tag className="network-tag">Ethereum Sepolia</Tag>
            <Tag className="connected-tag">合约已连接</Tag>
          </Space>
          <Space>
            {!ready ? null : authenticated && address ? (
              <Dropdown menu={{ items: accountMenuItems }} placement="bottomRight">
                <Button type="text" className="account-button">
                  <UserOutlined /> <Text>{shortAddress}</Text>
                </Button>
              </Dropdown>
            ) : (
              <Button type="primary" onClick={login} className="login-button">
                Privy 登录
              </Button>
            )}
          </Space>
        </Header>

        <Content className="app-content">{children}</Content>
        <Footer className="app-footer">Web3 大学 ©{new Date().getFullYear()} — 区块链教育平台</Footer>
      </AntLayout>
    </AntLayout>
  );
}

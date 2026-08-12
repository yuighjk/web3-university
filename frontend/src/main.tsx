import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider as PrivyWagmiProvider } from '@privy-io/wagmi';
import { WagmiProvider } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';

import { wagmiConfig } from '@/wagmi';
import Layout from '@/components/Layout';
import CourseList from '@/pages/CourseList';
import CourseDetail from '@/pages/CourseDetail';
import SwapPage from '@/pages/SwapPage';
import ProfilePage from '@/pages/ProfilePage';
import AdminPage from '@/pages/AdminPage';
import CreatorPage from '@/pages/CreatorPage';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <Layout>
        <CourseList />
      </Layout>
    ),
  },
  {
    path: '/course/:id',
    element: (
      <Layout>
        <CourseDetail />
      </Layout>
    ),
  },
  {
    path: '/swap',
    element: (
      <Layout>
        <SwapPage />
      </Layout>
    ),
  },
  {
    path: '/profile',
    element: (
      <Layout>
        <ProfilePage />
      </Layout>
    ),
  },
  {
    path: '/admin',
    element: (
      <Layout>
        <AdminPage />
      </Layout>
    ),
  },
  {
    path: '/creator',
    element: (
      <Layout>
        <CreatorPage />
      </Layout>
    ),
  },
  {
    path: '/owner',
    element: (
      <Layout>
        <AdminPage />
      </Layout>
    ),
  },
]);

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

const AppContent = (
  <ConfigProvider
    locale={zhCN}
    theme={{
      algorithm: theme.defaultAlgorithm,
      token: {
        colorPrimary: '#7355f5',
        colorBgBase: '#ffffff',
        colorTextBase: '#171b2e',
        borderRadius: 14,
      },
    }}
  >
    <RouterProvider router={router} />
  </ConfigProvider>
);

createRoot(rootEl).render(
  <StrictMode>
    {PRIVY_APP_ID ? (
      <PrivyProvider
        appId={PRIVY_APP_ID}
        config={{
          loginMethods: ['wallet', 'email', 'google'],
          appearance: { theme: 'dark' },
          embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
          supportedChains: [sepolia],
        }}
      >
        <QueryClientProvider client={queryClient}>
          <PrivyWagmiProvider config={wagmiConfig}>
            {AppContent}
          </PrivyWagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    ) : (
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {AppContent}
        </WagmiProvider>
      </QueryClientProvider>
    )}
  </StrictMode>,
);

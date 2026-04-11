import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/auth-context';
import { ControlPlaneProvider } from './contexts/convex-context';
import { ZeroSyncProvider } from './contexts/zero-context';
import { App } from './App';
import { Toaster } from '@/components/ui/sonner';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ControlPlaneProvider>
          <ZeroSyncProvider>
            <App />
            <Toaster position="bottom-right" />
          </ZeroSyncProvider>
        </ControlPlaneProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

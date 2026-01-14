'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';

import { AuthProvider } from './auth-provider';
import { CurrencyProvider } from './currency-provider';
import { ToastProvider, OfflineDetector } from '@/components/ui';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <CurrencyProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
            <OfflineDetector />
          </ToastProvider>
        </CurrencyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export { useCurrency, CurrencySelector } from './currency-provider';

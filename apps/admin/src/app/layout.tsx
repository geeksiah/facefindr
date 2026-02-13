import type { Metadata } from 'next';
import { Suspense } from 'react';

import './globals.css';
import { LoadingProgress } from '@/components/loading-progress';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastProvider } from '@/components/ui/toast';

export const metadata: Metadata = {
  title: 'FaceFindr Admin',
  description: 'FaceFindr Admin Dashboard',
  robots: 'noindex, nofollow', // Prevent search engines from indexing admin
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <ToastProvider>
            <Suspense fallback={null}>
              <LoadingProgress />
            </Suspense>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

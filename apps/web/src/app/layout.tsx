import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import '@/styles/globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'FaceFindr - Find Your Event Photos Instantly',
    template: '%s | FaceFindr',
  },
  description:
    'AI-powered facial recognition photo delivery platform. Photographers upload, attendees find their photos instantly.',
  keywords: [
    'event photography',
    'facial recognition',
    'photo delivery',
    'wedding photos',
    'conference photos',
    'marathon photos',
  ],
  authors: [{ name: 'FaceFindr' }],
  creator: 'FaceFindr',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://facefindr.app',
    siteName: 'FaceFindr',
    title: 'FaceFindr - Find Your Event Photos Instantly',
    description:
      'AI-powered facial recognition photo delivery platform. Photographers upload, attendees find their photos instantly.',
    images: [
      {
        url: '/assets/logos/og-logo.png',
        width: 1200,
        height: 630,
        alt: 'FaceFindr',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FaceFindr - Find Your Event Photos Instantly',
    description:
      'AI-powered facial recognition photo delivery platform. Photographers upload, attendees find their photos instantly.',
    images: ['/assets/logos/twitter-card.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Default favicon (PNG fallback) */}
        <link rel="icon" type="image/png" sizes="32x32" href="/assets/logos/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/assets/logos/favicon-16x16.png" />
        
        {/* SVG favicon with media query for light/dark browser themes */}
        {/* Light browser theme (Edge, etc.) = dark icon visible on light tabs */}
        <link 
          rel="icon" 
          type="image/svg+xml" 
          href="/assets/logos/icon.svg" 
          media="(prefers-color-scheme: light)" 
        />
        {/* Dark browser theme (Chrome dark mode, etc.) = light icon visible on dark tabs */}
        <link 
          rel="icon" 
          type="image/svg+xml" 
          href="/assets/logos/icon-dark.svg" 
          media="(prefers-color-scheme: dark)" 
        />
        
        {/* Apple Touch Icon */}
        <link rel="apple-touch-icon" sizes="180x180" href="/assets/logos/apple-touch-icon.png" />
        
        {/* Theme color */}
        <meta name="theme-color" content="#0A84FF" />
        <meta name="msapplication-TileColor" content="#0A84FF" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

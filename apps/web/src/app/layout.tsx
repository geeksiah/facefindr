import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import '@/styles/globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://ferchr.app'),
  title: {
    default: 'Ferchr - Find Your Event Photos Instantly',
    template: '%s | Ferchr',
  },
  description:
    'AI-powered facial recognition photo delivery platform. Creators upload, attendees find their photos instantly.',
  keywords: [
    'event photography',
    'facial recognition',
    'photo delivery',
    'wedding photos',
    'conference photos',
    'marathon photos',
  ],
  authors: [{ name: 'Ferchr' }],
  creator: 'Ferchr',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://ferchr.app',
    siteName: 'Ferchr',
    title: 'Ferchr - Find Your Event Photos Instantly',
    description:
      'AI-powered facial recognition photo delivery platform. Creators upload, attendees find their photos instantly.',
    images: [
      {
        url: '/assets/logos/og-logo.png',
        width: 1200,
        height: 630,
        alt: 'Ferchr',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ferchr - Find Your Event Photos Instantly',
    description:
      'AI-powered facial recognition photo delivery platform. Creators upload, attendees find their photos instantly.',
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
        {/* Primary favicon - app icon */}
        <link rel="icon" type="image/png" sizes="512x512" href="/assets/logos/app-icon-512.png" />
        <link rel="icon" type="image/png" sizes="48x48" href="/assets/logos/favicon-48x48.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/assets/logos/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/assets/logos/favicon-16x16.png" />
        
        {/* SVG favicon with media query for light/dark browser themes */}
        <link 
          rel="icon" 
          type="image/svg+xml" 
          href="/assets/logos/icon.svg" 
          media="(prefers-color-scheme: light)" 
        />
        <link 
          rel="icon" 
          type="image/svg+xml" 
          href="/assets/logos/icon-dark.svg" 
          media="(prefers-color-scheme: dark)" 
        />
        
        {/* Apple Touch Icon */}
        <link rel="apple-touch-icon" sizes="180x180" href="/assets/logos/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="1024x1024" href="/assets/logos/app-icon-1024.png" />
        
        {/* Theme color */}
        <meta name="theme-color" content="#0A84FF" />
        <meta name="msapplication-TileColor" content="#0A84FF" />
        <meta name="msapplication-TileImage" content="/assets/logos/app-icon-512.png" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

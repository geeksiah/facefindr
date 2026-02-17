/** @type {import('next').NextConfig} */
const reactAliases = {
  'react$': require.resolve('next/dist/compiled/react'),
  'react/jsx-runtime': require.resolve('next/dist/compiled/react/jsx-runtime'),
  'react/jsx-dev-runtime': require.resolve('next/dist/compiled/react/jsx-dev-runtime'),
  'react-dom$': require.resolve('next/dist/compiled/react-dom'),
  'react-dom/client': require.resolve('next/dist/compiled/react-dom/client'),
  'react-dom/server': require.resolve('next/dist/compiled/react-dom/server'),
};

const enableStandaloneOutput = process.env.NEXT_OUTPUT_STANDALONE === '1';

const nextConfig = {
  // Enable standalone output for Docker deployment
  output: enableStandaloneOutput ? 'standalone' : undefined,
  
  reactStrictMode: true,
  
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.in',
      },
    ],
  },
  
  // Security headers - stricter for admin
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Content Security Policy for admin
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Needed for Next.js
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https://*.supabase.co https://*.supabase.in",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co https://*.supabase.in",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },

  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...reactAliases,
    };

    return config;
  },
  experimental: {
    workerThreads: true,
    cpus: 1,
  },

};

module.exports = nextConfig;

/** @type {import('next').NextConfig} */
const reactAliases = {
  'react$': require.resolve('next/dist/compiled/react'),
  'react/jsx-runtime': require.resolve('next/dist/compiled/react/jsx-runtime'),
  'react/jsx-dev-runtime': require.resolve('next/dist/compiled/react/jsx-dev-runtime'),
  'react-dom$': require.resolve('next/dist/compiled/react-dom'),
  'react-dom/client': require.resolve('next/dist/compiled/react-dom/client'),
  'react-dom/server': require.resolve('next/dist/compiled/react-dom/server'),
};

const nextConfig = {
  reactStrictMode: true,

  transpilePackages: ['@facefind/shared'],

  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'mqndxshevzmxizvsbjua.supabase.co',
      pathname: '/storage/v1/object/**',
    },
  ],
},

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Enable mic if you do audio features:
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
        ],
      },
    ];
  },

  async redirects() {
    return [
      { source: '/events', destination: '/dashboard/events', permanent: false },
      { source: '/events/:path*', destination: '/dashboard/events/:path*', permanent: false },
      { source: '/p/:slug/followers', destination: '/c/:slug/followers', permanent: false },
      { source: '/p/:slug', destination: '/c/:slug', permanent: false },
    ];
  },

  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...reactAliases,
    };

    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    }
    return config;
  },

  experimental: {
    workerThreads: true,
    cpus: 1,
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, ''),
      ].filter(Boolean),
    },
  },
};

module.exports = nextConfig;

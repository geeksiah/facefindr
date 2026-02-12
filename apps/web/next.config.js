/** @type {import('next').NextConfig} */
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
      { source: '/dashboard', destination: '/dashboard/events', permanent: false },
    ];
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    }
    return config;
  },

  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, ''),
      ].filter(Boolean),
    },
  },
};

module.exports = nextConfig;

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.up.railway.app' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
};

export default nextConfig;

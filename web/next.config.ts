import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.up.railway.app' },
      // Explicit port required — Next only matches the default port when one is omitted,
      // so this needs to be listed for local dev where the backend serves /uploads itself.
      { protocol: 'http', hostname: 'localhost', port: '4000' },
    ],
  },
};

export default nextConfig;

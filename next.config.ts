import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentUpgrade: 'security',
  },
  reactCompiler: true,
  output: 'export',
};

export default nextConfig;

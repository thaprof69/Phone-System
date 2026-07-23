import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@quantum-parks/ui'],
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1'],
};
export default config;

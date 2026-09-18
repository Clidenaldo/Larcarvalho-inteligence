import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  distDir:
    process.env.E2E_TEST === 'true'
      ? '.next-e2e'
      : process.env.PUBLIC_THEME_E2E === 'true'
        ? '.next/public-theme-e2e'
        : '.next',
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      {
        // When your React app calls /api/bridge/..., 
        // Next.js proxies it to the actual Bridge Sandbox
        source: '/api/bridge/:path*',
        destination: 'https://api.sandbox.bridge.xyz/v0/:path*',
      },
      {
        source: '/api/paytech/:path*',
        destination: 'https://api.pay.tech/v1/:path*',
      },
    ];
  },
  // Experimental 2026 features for faster builds
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
    reactCompiler: true,
    turbopackFileSystemCache: true,
  }

};

export default nextConfig;

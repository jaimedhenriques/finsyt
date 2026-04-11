import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Disable ESLint during production builds — we'll run it separately
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allow builds to complete even with type errors
    ignoreBuildErrors: true,
  },
  env: {
    FMP_API_KEY:           process.env.FMP_API_KEY           || '',
    ALPHA_VANTAGE_API_KEY: process.env.ALPHA_VANTAGE_API_KEY || '',
    FINNHUB_API_KEY:       process.env.FINNHUB_API_KEY       || '',
    SEC_API_KEY:           process.env.SEC_API_KEY           || '',
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ]
  },
}

export default nextConfig

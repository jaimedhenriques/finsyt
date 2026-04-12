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
    NEXT_PUBLIC_FMP_API_KEY: process.env.FMP_API_KEY           || '',
    ALPHA_VANTAGE_API_KEY: process.env.ALPHA_VANTAGE_API_KEY || '',
    FINNHUB_API_KEY:       process.env.FINNHUB_API_KEY       || '',
    SEC_API_KEY:           process.env.SEC_API_KEY           || '',
    SUPABASE_URL:          process.env.SUPABASE_URL          || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
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

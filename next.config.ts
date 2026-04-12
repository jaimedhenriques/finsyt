import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  env: {
    // Standard names
    FMP_API_KEY:              process.env.FMP_API_KEY              || '',
    NEXT_PUBLIC_FMP_API_KEY:  process.env.FMP_API_KEY              || '',
    GROQ_API_KEY:             process.env.GROQ_API_KEY             || '',
    PERPLEXITY_API_KEY:       process.env.PERPLEXITY_API_KEY       || '',
    FINNHUB_API_KEY:          process.env.FINNHUB_API_KEY          || '',
    FRED_API_KEY:             process.env.FRED_API_KEY             || '',
    SEC_API_KEY:              process.env.SEC_API_KEY              || '',
    DATABENTO_API_KEY:        process.env.DATABENTO_API_KEY        || '',
    JWT_SECRET:               process.env.JWT_SECRET               || '',
    // Support both naming conventions used across the two projects
    EODHD_API_KEY:            process.env.EODHD_API_KEY            || process.env.eodhd_api || '',
    API_KEY_21ST:             process.env.API_KEY_21ST             || process.env._21st_api  || '',
    POSTGRES_URL:             process.env.POSTGRES_URL             || '',
    FIGMA_ACCESS_TOKEN:       process.env.FIGMA_ACCESS_TOKEN       || '',
    FIGMA_CLIENT_ID:          process.env.FIGMA_CLIENT_ID          || '',
    FIGMA_CLIENT_SECRET:      process.env.FIGMA_CLIENT_SECRET      || '',
    NEXT_PUBLIC_FIGMA_CLIENT_ID: process.env.FIGMA_CLIENT_ID       || '',
  },
  async headers() {
    return [{
      source: '/api/:path*',
      headers: [
        { key: 'Access-Control-Allow-Origin',  value: '*' },
        { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
        { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
      ],
    }]
  },
}

export default nextConfig

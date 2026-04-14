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
    SUPABASE_URL:             process.env.SUPABASE_URL             || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.finsyt_SUPABASE_URL || process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_URL || '',
    SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY|| process.env.finsyt_SUPABASE_SERVICE_ROLE_KEY || process.env.finsyt_SUPABASE_SECRET_KEY || '',
    SUPABASE_ANON_KEY:        process.env.SUPABASE_ANON_KEY        || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.finsyt_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY || '',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY || '',
    POSTGRES_DATABASE:        process.env.POSTGRES_DATABASE        || process.env.finsyt_POSTGRES_DATABASE || '',
    POSTGRES_HOST:            process.env.POSTGRES_HOST            || process.env.finsyt_POSTGRES_HOST || '',
    POSTGRES_USER:            process.env.POSTGRES_USER            || process.env.finsyt_POSTGRES_USER || '',
    POSTGRES_PASSWORD:        process.env.POSTGRES_PASSWORD        || process.env.finsyt_POSTGRES_PASSWORD || '',
    POSTGRES_PRISMA_URL:      process.env.POSTGRES_PRISMA_URL      || process.env.finsyt_POSTGRES_PRISMA_URL || '',
    POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING || process.env.finsyt_POSTGRES_URL_NON_POOLING || '',
    // Stripe
    STRIPE_SECRET_KEY:        process.env.STRIPE_SECRET_KEY        || '',
    STRIPE_WEBHOOK_SECRET:    process.env.STRIPE_WEBHOOK_SECRET    || '',
    STRIPE_PRO_PRICE_ID:      process.env.STRIPE_PRO_PRICE_ID      || '',
    STRIPE_ENTERPRISE_PRICE_ID: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
    NEXT_PUBLIC_STRIPE_PRO_PRICE_ID: process.env.STRIPE_PRO_PRICE_ID || '',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '',
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

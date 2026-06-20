import type { NextConfig } from "next";

// Isolate the dev server's build output from the production build's output.
// `next dev` and `next build` would otherwise both write to `.next/`, so the
// "build" workflow (which runs in parallel with the dev preview during agent
// validation) deletes files like `routes-manifest.json` and vendor chunks
// while the dev server is still serving them — producing 500s on `/sign-in`,
// `/app`, etc. and breaking authenticated end-to-end tests. By giving each
// mode its own `distDir`, the two never touch the same files.
//
// Production stays on `.next/` so the production runner (`next start`), the
// build cache's output detection, and the base-path assertion in
// `scripts/src/build-artifacts.ts` (which reads `.next/routes-manifest.json`)
// keep working without changes.
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  basePath: '/platform',
  distDir: isDev ? '.next-dev' : '.next',
  poweredByHeader: false,
  // drizzle-kit is a heavy dev-only tool used at runtime solely by the
  // read-only schema-status route (@workspace/db/schema-diff). Keep it
  // external so Next never tries to bundle its internals into the server build.
  serverExternalPackages: ['drizzle-kit'],
  // `serverExternalPackages` alone doesn't win here: schema-diff.ts lives in a
  // workspace package that Next bundles by default, so webpack follows its
  // dynamic `import('drizzle-kit/api')` and tries to bundle drizzle-kit's
  // internals (esbuild, plus optional pg drivers like @vercel/postgres /
  // @neondatabase/serverless that aren't installed) — which fails the build.
  // Force drizzle-kit (and its subpaths) to stay a runtime require on the
  // server so it is resolved from node_modules at call time, never bundled.
  webpack: (config: { externals?: unknown }, { isServer }: { isServer: boolean }) => {
    if (isServer) {
      const prev = config.externals
      const list = Array.isArray(prev) ? prev : prev ? [prev] : []
      config.externals = [
        ...list,
        (
          ctx: { request?: string },
          cb: (err?: unknown, result?: string) => void,
        ) => {
          const req = ctx.request
          if (req === 'drizzle-kit' || (req && req.startsWith('drizzle-kit/'))) {
            return cb(null, `commonjs ${req}`)
          }
          cb()
        },
      ]
    }
    return config
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: '/platform',
    // ⚠️  IMPORTANT: anything listed in this `env` block gets inlined into
    // client bundles at build time and is therefore PUBLIC. All server-only
    // API keys (FMP, GROQ, PERPLEXITY, FINNHUB, FRED, SEC, DATABENTO, EODHD,
    // TWELVEDATA, FINANCIAL_DATASETS, FINANCEFLOW, MASSIVE/POLYGON,
    // OPENWEBNINJA, CORESIGNAL, ALPHA_VANTAGE, FISCAL_AI, OPENAI, ANTHROPIC,
    // JWT_SECRET, SUPABASE_SERVICE_ROLE_KEY, CLERK_SECRET_KEY, etc.) are
    // intentionally NOT listed here. Server modules (route handlers, server
    // actions, server components) read them directly from `process.env`, and
    // env-name aliases live in `lib/data-providers.ts`. Only NEXT_PUBLIC_* /
    // safe non-secret config below.
    // Public-safe Supabase URL + anon key only. Service role key, Postgres
    // creds, and CLERK_SECRET_KEY are server-only and read directly from
    // process.env — they MUST NOT be inlined here.
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY || '',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY || '',
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: '/platform/sign-in',
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: '/platform/sign-up',
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: '/platform/app',
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: '/platform/app',
  },
  // CORS for /api/* is intentionally NOT a wildcard. Cross-origin access
  // should be granted explicitly per route via NextResponse headers, against
  // an env-driven allowlist (see PLATFORM_CORS_ALLOWED_ORIGINS in SECURITY.md).
  // Static security headers are applied by `middleware.ts` on every response.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
        ],
      },
    ]
  },
}

export default nextConfig

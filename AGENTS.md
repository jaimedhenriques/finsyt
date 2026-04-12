# Finsyt — Agent Coordination Guide

## Repo Structure (Single Source of Truth)

```
/ (repo root)
├── app/                    ← The Next.js app (Vercel deploys THIS)
│   ├── api/                ← All API routes
│   └── app/                ← All pages (dashboard, company, research, etc.)
├── components/             ← Shared React components
├── lib/                    ← Utilities, data providers, Supabase client
├── functions/              ← Slack/webhook edge functions
├── public/                 ← Static assets
├── next.config.ts          ← Env var aliases (canonical)
└── AGENTS.md               ← This file
```

## Ownership Map

| Path | Owner | Status | Notes |
|------|-------|--------|-------|
| app/app/company/[symbol]/ | Base44 | Done | 10-tab company page — DO NOT rebuild |
| app/app/research/ | Base44 | Done | Finsyt Intelligence streaming chat |
| app/app/page.tsx | Base44 | Done | Live dashboard |
| app/api/research/ | Base44 | Done | SSE streaming with 7 tools |
| app/app/layout.tsx | Cursor | Needed | Auth middleware + session provider |
| middleware.ts | Cursor | Needed | Protect /app/* → redirect unauthenticated |
| lib/supabase/ | Cursor | Needed | createClient, useUser, useSession hooks |
| app/app/auth/ | Cursor | Needed | Login/signup pages (app router) |
| app/api/webhooks/stripe/ | Cursor | Needed | Stripe webhook handler |
| app/api/checkout/ | Cursor | Needed | Stripe checkout session |

## Base44 Agent

Owns: product UI, data wiring, feature pages. Pushes directly to main.

Data stack: EODHD (prices/fundamentals/ESG/insider), FMP (financials/transcripts/ownership), SEC EDGAR (18M+ filings), FRED (macro — 11 series), Finnhub (real-time/analyst).

DO NOT edit: app/app/company/, app/app/research/, app/api/research/, app/app/page.tsx

## Cursor

Owns: auth, payments, infrastructure, database schema. Branch → PR flow.

Priority: #16 Auth → #17 Stripe → #20 Feature gating

Supabase env vars (all in Vercel):
- NEXT_PUBLIC_finsyt_finsytSUPABASE_URL
- NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY
- finsyt_SUPABASE_SERVICE_ROLE_KEY

DO NOT edit: app/app/company/, app/app/research/, app/api/research/, app/app/page.tsx

## Branch Conventions

- Base44: direct push to main (scoped commits)
- Cursor: cursor/<task>-<hash> → PR → merge

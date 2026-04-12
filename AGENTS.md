# Finsyt — Agent Coordination Guide

## Repo Structure (Single Source of Truth)

> PR #23 merged — `finsyt-platform/` and `pages/` are gone. Everyone edits under these paths only:

```
/ (repo root)
├── app/                    ← The one Next.js app (Vercel deploys THIS)
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
| app/app/research/ | Base44 | Done | Finsyt Intelligence streaming chat (SSE) |
| app/app/page.tsx | Base44 | Done | Redirects → /app/research |
| app/api/research/ | Base44 | Done | SSE streaming with 7 tools (Groq+Perplexity+EODHD+FMP+FRED+Finnhub+SEC) |
| app/app/layout.tsx | Cursor | Needed | Auth middleware + session provider |
| middleware.ts | Cursor | Needed | Protect /app/* → redirect unauthenticated |
| lib/supabase/ | Cursor | Needed | createClient, useUser, useSession hooks |
| app/app/auth/ | Cursor | Needed | Login/signup pages (app router) |
| app/api/webhooks/stripe/ | Cursor | Needed | Stripe webhook handler |
| app/api/checkout/ | Cursor | Needed | Stripe checkout session |

## Base44 Agent — Current State

Owns: product UI, data wiring, feature pages. Pushes directly to `main`.

**What Base44 has built (all live in `app/`):**
- `app/app/research/` — Finsyt Intelligence: SSE streaming chat with 8 prompt starters, tool-call UI (quote/news/insider/filings/screener/macro/private), model badge
- `app/api/research/` — SSE route: Groq (llama-3.3-70b) orchestrator + Perplexity web search + 7 data tools hitting EODHD, FMP, FRED, Finnhub, SEC EDGAR
- `app/app/company/[symbol]/` — 10-tab company page
- `app/app/page.tsx` — redirects to `/app/research`
- `app/app/` subdirectories: alerts, deals, developer, discovery, docs, filings, formulas, macro, markets, mcp, news, private, screener, settings, watchlist, widgets, workspaces
- `components/` — AppShell, MagicChatBubble, NavCustomiser, WidgetGrid, WidgetPicker, widgets/
- `lib/data-providers.ts` — multi-provider waterfall (EODHD → FMP → Finnhub → Yahoo fallback)
- `functions/` — Slack message handler + responder

**Data stack:** EODHD (prices/fundamentals/ESG/insider), FMP (financials/transcripts/ownership), SEC EDGAR (18M+ filings), FRED (macro — 11 series), Finnhub (real-time/analyst), Perplexity (web search), Groq (LLM inference)

**DO NOT edit:** `app/app/company/`, `app/app/research/`, `app/api/research/`, `app/app/page.tsx`

## Cursor Agent — Priority Queue

Owns: auth, payments, infrastructure, database schema. Branch → PR flow.

**Priority order:**
1. **#16 Auth** — `middleware.ts` + `lib/supabase/` + `app/app/auth/` (login/signup) + `app/app/layout.tsx` session provider
2. **#17 Stripe** — `app/api/webhooks/stripe/` + `app/api/checkout/`
3. **#20 Feature gating** — guard research/company pages behind subscription check

**Supabase env vars (set in Vercel):**
- `NEXT_PUBLIC_finsyt_finsytSUPABASE_URL`
- `NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY`
- `finsyt_SUPABASE_SERVICE_ROLE_KEY`

**Data API env vars (already wired in `next.config.ts`):**
- `EODHD_API_KEY` / `eodhd_api` (both aliased)
- `FMP_API_KEY`, `GROQ_API_KEY`, `PERPLEXITY_API_KEY`, `FINNHUB_API_KEY`
- `FRED_API_KEY`, `SEC_API_KEY`, `DATABENTO_API_KEY`

**DO NOT edit:** `app/app/company/`, `app/app/research/`, `app/api/research/`, `app/app/page.tsx`

## Branch Conventions

- **Base44:** direct push to `main` (scoped commits, no PRs)
- **Cursor:** `cursor/<task>-<hash>` → PR → merge into `main`

## What Cursor Should Build Next (Auth — #16)

```
lib/supabase/
  client.ts          ← createBrowserClient() for client components
  server.ts          ← createServerClient() for server components / route handlers
  hooks.ts           ← useUser(), useSession() React hooks

app/app/auth/
  login/page.tsx     ← email+password + Google OAuth
  signup/page.tsx    ← email+password + Google OAuth
  callback/route.ts  ← OAuth callback handler

middleware.ts        ← matcher: /app/:path* — redirect → /app/auth/login if no session

app/app/layout.tsx   ← wrap children with SessionProvider (or pass user server-side)
```

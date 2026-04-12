# Finsyt — Agent Coordination Guide

## ⚠️ HARD RULES — Both Agents Must Follow

1. **NO competitor name-drops** anywhere in the codebase or copy. Banned names: Capital IQ, Bloomberg Terminal, FactSet, Refinitiv, AlphaSense, Rogo, Compustat, Morningstar, Daloopa, Quartr, Hebbia. Use "institutional-grade" or describe Finsyt's own capabilities instead.
2. **NO Capital IQ mnemonics (IQ_ prefix).** Use FQL exclusively: FX_, FV_, FM_, FE_, FG_, FR_, FD_ prefixes.
3. **Coordinate via GitHub Issues.** If Base44 agent closes an issue, Cursor must not open a conflicting PR.

---


> PR #23 merged — `finsyt-platform/` and `pages/` are gone. Everyone edits under these paths only:

## Repo Structure (Single Source of Truth)

```
/ (repo root)
├── app/                    ← The one Next.js app (Vercel deploys THIS)
│   ├── api/                ← All API routes (27 route files)
│   └── app/                ← All pages (20+ sub-dirs)
├── components/             ← Shared React components (AppShell, MagicChatBubble, widgets)
├── lib/                    ← Utilities, data providers, Supabase client
├── functions/              ← Slack message handler + responder
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
- `app/app/company/[symbol]/` — 10-tab company page (1252 lines)
- `app/app/page.tsx` — redirects to `/app/research`
- `app/app/` subdirectories: alerts, deals, developer, discovery, docs, filings, figma, formulas, macro, markets, mcp, news, private, screener, settings, watchlist, widgets, workspaces
- `app/api/` routes: aggs, ai-research, an-token, company-discovery, coresignal, earnings-calendar, eodhd, figma, filings, financials, forex, health, insider, macro, market-status, market-trends, mcp, news, quote, research, screener, search, sec (5 sub-routes), technicals, transcripts, watchlist, workspaces (4 sub-routes)
- `components/` — AppShell, MagicChatBubble, NavCustomiser, WidgetGrid, WidgetPicker, widgets/
- `lib/data-providers.ts` — multi-provider waterfall (EODHD → FMP → Finnhub → Yahoo fallback)
- `lib/workspace.tsx` — workspace context provider
- `lib/i18n/` — LocaleContext + translations
- `functions/` — Slack message handler + responder

**Data stack:** EODHD (prices/fundamentals/ESG/insider), FMP (financials/transcripts/ownership), SEC EDGAR (18M+ filings), FRED (macro — 11 series), Finnhub (real-time/analyst), Perplexity (web search), Groq (LLM inference), CoreSignal (private company data), OpenWebNinja (Google Finance real-time)

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
- `API_KEY_21ST` / `_21st_api`, `POSTGRES_URL`, `JWT_SECRET`

**DO NOT edit:** `app/app/company/`, `app/app/research/`, `app/api/research/`, `app/app/page.tsx`

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

## Branch Conventions

- **Base44:** direct push to `main` (scoped commits, no PRs)
- **Cursor:** `cursor/<task>-<hash>` → PR → merge into `main`


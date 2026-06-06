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
| app/app/layout.tsx | Cursor | Done | Clerk provider + app shell |
| middleware.ts | Cursor | Done | Clerk auth; `/api/webhooks/stripe` public |
| lib/auth-server.ts, lib/billing.ts | Cursor | Done | Org-scoped entitlements + Stripe sync |
| app/api/webhooks/stripe/ | Cursor | Done | Stripe webhook → `org_subscriptions` |
| app/api/stripe/create-checkout/ | Cursor | Done | Checkout redirect (replaces legacy `/api/checkout/`) |
| app/api/billing/status/, portal/ | Cursor | Done | Live plan UI + Customer Portal |

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

**Auth (canonical):** Clerk — sign-in at `/platform/sign-in`. Do **not** add client-side tier spoofing; entitlements live in `lib/billing.ts` keyed on `clerk_org_id`.

**Billing / Stripe (Cursor owns):**
- `lib/billing.ts` — server entitlements (`getOrgTier`, `checkAiQueryEntitlement`, `requireProFeature`)
- `lib/billing-entitlements.ts` — pure helpers (unit-tested, no DB)
- `lib/stripe.ts` — Stripe client + env helpers
- `app/api/stripe/create-checkout/route.ts` — Pro checkout (`?plan=pro`)
- `app/api/webhooks/stripe/route.ts` — subscription lifecycle webhooks (public route)
- `app/api/billing/status/route.ts` — JSON plan snapshot for UI
- `app/api/billing/portal/route.ts` — Stripe Customer Portal session
- Feature gates: `app/api/agent/ask`, `app/api/research` (top gate), `app/api/transcripts`, `app/api/insider`, `app/api/analyst-questions`, `app/api/extract-graphs`
- UI: `app/app/upgrade/page.tsx`, `app/app/settings/page.tsx` (`BillingPlanCard`), `lib/tier.ts` (fetches `/platform/api/billing/status`)
- Launch checklist: `docs/MVP_LAUNCH.md`

**Billing env vars (Vercel — server-only):**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`
- `APP_URL` (production canonical URL, e.g. `https://finsyt.com`)
- `DATABASE_URL` / `POSTGRES_URL` — required for `org_subscriptions` + `usage_counters`
- **Production:** `PLATFORM_OPEN_MODE` must be unset (demo bypass grants Pro)

**Clerk env vars (set in Vercel):**
- `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (wired via `next.config.ts`)

**Data API env vars (already wired in `next.config.ts`):**
- `EODHD_API_KEY` / `eodhd_api` (both aliased)
- `FMP_API_KEY`, `GROQ_API_KEY`, `PERPLEXITY_API_KEY`, `FINNHUB_API_KEY`
- `FRED_API_KEY`, `SEC_API_KEY`, `DATABENTO_API_KEY`
- `API_KEY_21ST` / `_21st_api`, `POSTGRES_URL`, `JWT_SECRET`

**DO NOT edit:** `app/app/company/`, `app/app/research/`, `app/api/research/`, `app/app/page.tsx`

## Branch Conventions

- **Base44:** direct push to `main` (scoped commits, no PRs)
- **Cursor:** `cursor/<task>-<hash>` → PR → merge into `main`


## Sourcing pipeline — 21st.dev components (Task #185)

The platform sources design primitives from the user's own 21st.dev account before assembling them into the in-app design system. Pipeline scripts live in `artifacts/platform/scripts/source-21st/`.

- `source.ts` — fetches a component slug from 21st.dev, normalises to `components/ui/sourced/<slug>/`, rewrites imports to `@/components/ui`, strips out external utilities not present in this project. Must be idempotent: re-running on the same slug overwrites only the sourced/<slug> directory and never touches consumer pages.
- All raw sourced components live under `components/ui/sourced/<slug>/`. Pages **MUST** import from `@/components/ui` (the curated barrel), never directly from `sourced/`. The barrel re-exports a constrained surface so we can swap implementations later without touching every page.
- Lucide-react is the only icon library. Emoji glyphs are forbidden in: nav chrome (sidebar, topbar), page heroes, agent suggestions, and ContextualAskBar chip labels. They remain acceptable in user-authored content (notes, chat, demo seed data) and in legacy badges that have not yet been swept.
- `ContextualAskBar` is the canonical inline ask surface. Mount it once per top-level page directly under the page header. It accepts `context: string`, optional `contextData: object` (forwarded to the agent run), `chips: AskChip[]` (label + prompt), `placeholder`, and `style` for per-page margin overrides.
- Hard rule: do not mount `ContextualAskBar` inside the AppShell — it must be page-owned so each page sets domain-specific chips and contextData.

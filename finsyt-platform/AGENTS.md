# Finsyt — Agent Coordination Notes

## Last updated: 2026-04-13

## Architecture
- `/app/page.tsx` — **Landing page** (public, white design)
- `/app/app/*` — **Platform interior** (dark navy, requires auth)
- `/components/AppShell.tsx` — Sidebar + topbar shell for all `/app/*` pages
- `/lib/data-providers.ts` — Central data provider registry

## Pending Cursor Tasks (GitHub Issues)

| # | Title | Priority |
|---|-------|----------|
| 38 | Auth: Supabase SSR middleware + /auth/login | 🔴 Critical |
| 39 | Stripe: checkout + webhook + plan gating | 🔴 Critical |
| 40 | DB Schema: watchlist, alerts, notes, searches | 🔴 Critical |
| 41 | Performance: bundle analysis + code splitting | 🟡 High |
| 42 | API: earnings calendar + insider + analyst + ownership + transcripts | 🟡 High |
| 43 | Auth pages: /auth/login + /auth/signup + /auth/callback | 🔴 Critical |
| 44 | Company page: Transcripts tab | 🟡 High |
| 45 | Markets page: heat map + sector rotation | 🟢 Normal |
| 46 | Alerts page: full CRUD + toast notifications | 🟡 High |

## Design System (DO NOT CHANGE THESE)
- Landing: white background (#FFFFFF), Georgia serif headlines, #1A56FF accent
- Platform: dark navy (#080E1A bg, #0A1220 sidebar), Inter font, #1B4FFF accent
- Utility classes are defined in `components/AppShell.tsx` <style> tag (dark variants)
- Do NOT import tailwind for platform pages — use inline styles + CSS classes from AppShell

## Data Provider Priority Order
1. Polygon.io (live market data) → env: `POLYGON_API_KEY`
2. FMP (fundamentals, estimates, insider) → env: `FMP_API_KEY`  
3. EODHD (EOD, fundamentals, macro) → env: `EODHD_API_KEY`
4. Finnhub (news, sentiment) → env: `FINNHUB_API_KEY`
5. FRED (macro data) → env: `FRED_API_KEY`

## Stripe (Live account)
- Account ID: acct_1TLIyDGdiarCQPXG
- Free price: price_1TLIrHLJMiDaOoccrxhi7OxY ($0/mo)
- Pro price: price_1TLIrHLJMiDaOocclbXxjbMu ($29/mo)

## Supabase
- Project: supabase-byzantium-crystal
- ID: dqpudnphowruazuraipw
- Env vars: NEXT_PUBLIC_finsyt_finsytSUPABASE_URL, NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY

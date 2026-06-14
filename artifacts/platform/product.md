# Finsyt — Product Master Prompt

## What Finsyt Is
Finsyt is an AI-powered financial intelligence and execution workspace for founders, operators, and analysts. It replaces fragmented tools (Bloomberg Terminal, FactSet, Capital IQ, AlphaSense, Rogo) with a single, AI-native platform.

## Target Users
- **Founders & CEOs** — monitoring competitors, macro signals, investor narratives
- **Operators & CFOs** — financial analysis, earnings tracking, KPI benchmarking
- **Analysts & PMs** — deep research, screening, model-building, transcript analysis

## Current Platform State (as of April 2026)
- **Live sections:** AI Research, Markets, Screener, Watchlist, Filings, Transcripts, Workspaces, Macro, Private Co., Alerts, MCP Tools, API Docs, Formula Engine (FQL)
- **Data waterfall:** FMP (primary) → EODHD → Finnhub → FRED → Polygon
- **Company pages:** Overview, Financials (IS/BS/CF), Estimates, Transcripts, Filings, Comps, News, AI Chat
- **Auth:** Supabase (in progress)
- **Payments:** Stripe (Free / $29/mo Pro)
- **Deployed:** finsyt-platform.vercel.app (Vercel + GitHub CI)

## What Good Looks Like (PMF Definition)
Users consistently:
1. Find actionable financial insight within 60 seconds of opening the app
2. Use AI Research to answer questions they previously used Bloomberg/Google for
3. Rate the platform 9+ / 10 NPS after a session
4. Return the next day without being prompted

## Priority Improvements (ranked by user signal)
1. **Speed** — data loads must feel instant; skeleton states always shown
2. **AI accuracy** — AI Research answers must cite real sources, not hallucinate
3. **Coverage** — more tickers, more global markets, more macro indicators
4. **UI clarity** — users should immediately know where to go for what
5. **Onboarding** — first-session experience must explain what Finsyt can do
6. **Export** — CSV and Excel export on every data table

## Constraints
- No breaking changes to existing API routes
- Keep TypeScript strict (no `any`)
- No hardcoded secrets
- Surgical changes only — don't refactor what works

## Iteration Log
<!-- AutoPMF will append here each cycle -->
| Cycle | Date | NPS | Change Made | Status |
|-------|------|-----|-------------|--------|
| 0 | 2026-04-13 | baseline | Initial product.md created | active |

## Stop Condition
3 consecutive cycles with NPS average ≥ 9.0 → PMF declared. Notify Jaime.

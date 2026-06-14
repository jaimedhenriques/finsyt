---
name: Internal loopback fetch anti-pattern (platform)
description: Why server routes should call provider/lib functions directly instead of HTTP-fetching sibling Next API routes over the loopback.
---

Server-side code in `artifacts/platform` that needs data another internal API
route also serves should call the underlying lib function directly — NOT
`fetch('http://127.0.0.1:${PORT}${basePath}/api/...')`.

**Why:** loopback fetches to sibling Next routes are flaky under concurrency in
this environment. Symptoms seen while building the Signals back-test: bursts of
all-zero / empty responses, intermittent "passes then fails" runs, and total
fan-out failures right after a dev-server recompile or while the parallel
validation workflows (build/typecheck/lint/test/e2e) compete for resources. The
loopback ALSO double-charges: the route re-enters Next routing, auth, and the
whole provider waterfall per call.

**How to apply:** extract the shared logic into a `lib/*` function and import it.
For daily price bars there is now `dailyBarsWaterfall(symbol, from, to)` in
`artifacts/platform/lib/data-providers.ts` (mirrors the `/api/aggs` provider
waterfall: massive → fmp → twelvedata → eodhd → marketstack → alphav → yahoo)
returning `{ bars, source } | null`. The `/api/aggs` route itself still does its
own thing; the helper exists for server-to-server callers like
`/api/signals/backtest`.

Also note: in this dev env the free provider tiers exhaust quickly under heavy
testing (TwelveData HTTP 429, Alpha Vantage "premium endpoint" / 25-req-day,
FMP caps). ETF/index benchmarks (SPY, QQQ) are only on twelvedata here (no FMP
ETF coverage), so they fail first. "All bar providers exhausted" during a test
session is environmental, not a code bug — the honest `insufficient_data` empty
state firing is correct behavior.

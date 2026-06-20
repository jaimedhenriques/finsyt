---
name: Quote provider waterfall & dead-key handling
description: How /api/quote degrades across providers and why we don't add a circuit-breaker for rejected keys.
---

# Quote provider waterfall (platform `/api/quote`)

`resolveQuote(symbol)` walks a provider waterfall (fmp / openwebninja / yahoo /
finnhub / eodhd / alphav / marketstack / twelvedata / alpaca / massive /
databento). Each provider failure is caught and the next is tried, so a dead
upstream fails closed and never breaks quote resolution. Responses carry a
`source` code and a server-stamped `asOf` ISO timestamp; the UI surfaces both
(see `lib/provider-labels.ts` + `components/QuoteFreshness.tsx`).

Batch mode is `?symbols=A,B,C` (cap 30, parallel) and returns
`{ quotes, count, asOf }`. Some providers (notably OpenWebNinja) echo an
exchange-suffixed symbol like `AAPL:NASDAQ`, so batch normalises each result's
`symbol` back to the requested ticker.

## Do NOT add a rejected-key circuit-breaker / provider-skip

**Rule:** Do not short-circuit a provider just because its key recently 401'd.
**Why:** `lib/credential-health.ts` records key rejection/acceptance on every
401/403 and detects recovery when a rotated key starts succeeding again.
Skipping known-bad providers would suppress that recovery probe, so a freshly
rotated key would never be re-detected as healthy.
**How to apply:** Let the waterfall keep probing; surface dead keys to the user
as a replacement request (and via the existing credential-health webhook),
rather than silently skipping the provider.

## Dropping a provider on purpose (operator decision)

Set the `DROPPED_PROVIDERS` env var (comma-separated provider names, e.g.
`massive,databento`). `PROVIDERS` blanks any listed provider's key via `keyFor()`
so its `if (!PROVIDERS.<name>) return null` guards skip it — no upstream call, no
401 noise. Reversible: remove from `DROPPED_PROVIDERS` to re-enable.
**Why this exists:** agent tooling can set/delete *env vars* but CANNOT delete
*secrets* — `deleteEnvVars` only touches the env-var store, so a dead key left in
Secrets keeps getting probed. `DROPPED_PROVIDERS` is the in-code escape hatch.
This differs from the forbidden auto circuit-breaker above: it's an explicit,
deliberate opt-out, not automatic skipping based on 401s.

---
name: Polymarket & Kalshi public API quirks
description: Non-obvious discovery/field quirks for the read-only prediction-market provider adapters (lib/prediction-markets.ts)
---

# Polymarket (Gamma API)

- `gamma-api.polymarket.com/markets` caps each page at **100 rows** regardless of
  `limit` (even `limit=500` returns 100), ordered by volume. So the volume-ranked
  listing misses almost all company-specific markets.
- For keyword/company queries use `gamma-api.polymarket.com/public-search?q=<term>&events_status=active&limit_per_type=N`.
  It returns `events[]` each with nested `markets[]` of the same shape as `/markets`
  (question, outcomes, outcomePrices, volumeNum, oneDayPriceChange, slug, endDate).
  Link back to the **event** slug, not the market slug.
- Search responses embed full nested market objects and routinely exceed Next's
  2MB fetch-cache ceiling → fetch with `cache: 'no-store'` (the revalidate cache
  throws "items over 2MB can not be cached").

# Kalshi (api.elections.kalshi.com/trade-api/v2)

- **Price/volume fields are `_dollars` / `_fp` suffixed**, not the old names:
  `last_price_dollars`, `previous_price_dollars`, `yes_bid_dollars`,
  `yes_ask_dollars`, `volume_fp`, `volume_24h_fp`, `open_interest_fp`,
  `liquidity_dollars`. The `_dollars` values are already probabilities in 0..1
  (no /100). Reading the legacy `last_price`/`volume` names yields all-null and
  silently drops every market.
- The bare `/markets?status=open` listing is **flooded with thousands of unpriced
  multivariate sports parlays** (null prices, comma-concatenated junk titles).
  Scanning 6000+ rows / events-with-nested-markets surfaced **zero** priced
  markets. Do not browse via `/markets`.
- Real, priced research markets (politics, econ, financials incl. M&A, crypto)
  are only reachable **per series**: `GET /series?category=<Cat>` → take tickers →
  `GET /markets?series_ticker=<T>&status=open`. There is **no public full-text
  market search**, so keyword/company matching is done by filtering series
  ticker/title client-side.
- `/series?category=` **ignores `limit`/`status`** and returns the entire catalog
  (Politics ~2023 series ≈ 3.4MB), which exceeds Next's 2MB cache ceiling. Fetch
  with `cache: 'no-store'` and cache the per-category list **in-process** (TTL);
  it changes rarely. Bound series fan-out per request.

**Why:** building the read-only prediction-market signal — both venues' "obvious"
listing endpoints are unusable for the actual goal (company-relevant odds), and
Kalshi's renamed price fields make a correct-looking adapter return nothing.

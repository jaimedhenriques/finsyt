---
name: Fixed-income / rates desk surfaces
description: Which page is the FI/credit desk, and the source-tagging + reconciliation invariants for credit data.
---

# Fixed-income & rates surfaces

- The **credit/FI desk lives at `/app/rates`** ("Rates & Credit Desk"). The
  pre-existing macro/rates surface is **`/app/macro`** (FRED yield curve, 10Y/2Y,
  HY spread). Don't conflate them — `/app/rates` was added for issuer credit,
  `/app/macro` predates it.

- **Reconciliation invariant:** per-issuer credit spread series (company Fixed
  Income tab) must tie to the same FRED IG/HY OAS indices (`BAMLC0A0CM` /
  `BAMLH0A0HYM2`) that the aggregate `/app/rates` desk and `/app/macro` use. An
  issuer's modelled latest OAS is benchmarked off its grade's aggregate index, so
  changes to the implied-rating→spread mapping must keep IG issuers near the IG
  index and HY near the HY index.

**Why:** CUSIP/ISIN-level bond data and agency ratings are premium (not in the
wired free providers), so the bond ladder, instrument detail, and rating are a
deterministic (symbol-seeded) model derived from real FMP debt totals. It must
never be presented as a live bond feed — every FI object carries a `source` tag
(`fmp | fred | derived | synthetic | none`) surfaced via CitationChip, matching
the equities `source` convention.

**How to apply:** when wiring a premium FI connector, replace the modelled
instruments but keep the `source` contract and the IG/HY reconciliation.

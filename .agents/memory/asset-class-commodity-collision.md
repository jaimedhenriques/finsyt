---
name: Asset-class commodity/equity collision
description: Why bare commodity names must never auto-route to the commodity asset class in the symbol classifier.
---

# Bare commodity names collide with real equity tickers

The symbol classifier (`classifySymbol`) is the single routing point for
`/api/quote` and `/api/aggs`: an `equity` verdict keeps the symbol on the
existing multi-provider equity waterfall; any non-equity verdict diverts it to
the multi-asset resolver.

**Rule:** never auto-classify a *bare* alphabetic commodity name as a commodity.
Many are valid, tradeable equity tickers and a misroute silently breaks their
quote lookups:
- `GOLD` = Barrick Gold (NYSE)
- `WTI`  = W&T Offshore (NYSE)
- `OIL`, `CORN`, `SILVER`, `COPPER`, `GAS` = commodity ETFs/ETNs

**Why:** a code review rejected the first multi-asset pass precisely for this —
hard-routing bare names to commodities violated "disambiguate WITHOUT regressing
equities." It is a backward-compat trap, not a hypothetical.

**How to apply:** commodities resolve ONLY through unambiguous signals —
- explicit `CMDTY:`/`COMMODITY:` namespace (callers opt in; returns the clean
  canonical key, e.g. `CMDTY:GOLD` → symbol `GOLD`),
- Yahoo futures shapes (`GC=F`, generic `XX=F`),
- metal FX pairs (`XAU/USD`, `XAUUSD`).
Everything else falls through to the equity default. Treasury rate keys
(`US10Y`, `^TNX`, `DGS10`, `10Y`) are safe to match bare — none are valid equity
tickers — but a `RATE:`/`UST:` namespace exists for symmetry.

Surfaces that want commodities must send the namespace: the Markets page
commodity tab requests `CMDTY:<KEY>` and strips the prefix for display; the
agent `get_quote` tool description tells the model to prefix commodities.

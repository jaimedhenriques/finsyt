/**
 * Regression tests for the asset-class classifier (`lib/asset-class.ts`).
 *
 * The classifier is the single routing point for /api/quote and /api/aggs:
 * an `equity` verdict keeps a symbol on the existing provider waterfall, any
 * other verdict diverts it to the multi-asset resolver. The hard requirement
 * for multi-asset coverage is "disambiguate WITHOUT regressing equities", so
 * these specs lock two properties:
 *
 *   1. Bare tickers that collide with commodity names (GOLD = Barrick Gold,
 *      WTI = W&T Offshore, OIL/CORN = commodity ETFs) MUST stay `equity` so
 *      they keep traversing the equity waterfall.
 *   2. Unambiguous non-equity shapes (CMDTY: namespace, =F futures, dashed/
 *      slashed/6-char pairs, treasury keys) still classify correctly.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { classifySymbol, assetClassOf } from "../asset-class";

// ── 1. Equity backward-compatibility (the rejection that gated this task) ─────

test("bare commodity-name tickers stay equity (no waterfall regression)", () => {
  // Each of these is a real, tradeable equity that happens to share a name
  // with a commodity in the catalog/aliases.
  for (const sym of ["GOLD", "WTI", "OIL", "CORN", "SILVER", "COPPER", "GAS"]) {
    const c = classifySymbol(sym);
    assert.equal(
      c.assetClass,
      "equity",
      `${sym} must classify as equity, got ${c.assetClass}`,
    );
    // Equity verdict must keep the symbol verbatim and carry no yahoo override,
    // so the existing equity waterfall fetches it unchanged.
    assert.equal(c.symbol, sym);
    assert.equal(c.yahoo, null);
  }
});

test("ordinary equity tickers are unaffected", () => {
  for (const sym of ["AAPL", "NVDA", "MSFT", "BRK.B", "TSLA"]) {
    assert.equal(assetClassOf(sym), "equity");
  }
});

// ── 2. Explicit commodity namespace forces the commodity route ───────────────

test("CMDTY: prefix forces commodity and yields the clean canonical symbol", () => {
  const gold = classifySymbol("CMDTY:GOLD");
  assert.equal(gold.assetClass, "commodity");
  assert.equal(gold.symbol, "GOLD");
  assert.equal(gold.yahoo, "GC=F");

  const oil = classifySymbol("CMDTY:OIL"); // alias → WTI
  assert.equal(oil.assetClass, "commodity");
  assert.equal(oil.symbol, "WTI");

  assert.equal(classifySymbol("COMMODITY:CORN").assetClass, "commodity");
});

test("unambiguous commodity futures shapes still classify bare", () => {
  assert.equal(classifySymbol("GC=F").assetClass, "commodity"); // Yahoo gold future
  assert.equal(classifySymbol("CL=F").assetClass, "commodity"); // Yahoo WTI future
});

test("metal FX pairs route to commodity without a prefix", () => {
  for (const sym of ["XAUUSD", "XAU/USD", "XAGUSD"]) {
    assert.equal(classifySymbol(sym).assetClass, "commodity", sym);
  }
});

// ── 3. Crypto / FX / rates remain correctly classified ───────────────────────

test("crypto pairs classify as crypto", () => {
  for (const sym of ["BTC-USD", "ETH-USD", "BTCUSD", "X:SOLUSD"]) {
    assert.equal(classifySymbol(sym).assetClass, "crypto", sym);
  }
});

test("fiat FX pairs classify as fx", () => {
  for (const sym of ["EUR/USD", "EURUSD", "USD/JPY", "C:GBPUSD"]) {
    assert.equal(classifySymbol(sym).assetClass, "fx", sym);
  }
});

test("treasury keys/aliases classify as rate (never equity-ambiguous)", () => {
  for (const sym of ["US10Y", "US2Y", "^TNX", "DGS10", "10Y"]) {
    assert.equal(classifySymbol(sym).assetClass, "rate", sym);
  }
  assert.equal(classifySymbol("US10Y").symbol, "US10Y");
  assert.equal(classifySymbol("^TNX").symbol, "US10Y");
});

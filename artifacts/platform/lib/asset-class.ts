// ─────────────────────────────────────────────────────────────────────────────
// Asset-class resolution layer
// ─────────────────────────────────────────────────────────────────────────────
// Finsyt's market-data system is equity-centric. This module adds a single,
// pure (network-free) classifier that disambiguates a raw symbol into one of
// five asset classes — equity, crypto, fx, commodity, rate — and normalises it
// into a canonical form plus the provider-specific symbols downstream fetchers
// need (Yahoo chart symbol, Twelve Data symbol, FRED series id, …).
//
// The default is always `equity`, so bare US/intl tickers keep flowing through
// the existing quote/aggs waterfall untouched. Only symbols that match an
// explicit non-equity shape are reclassified.
// ─────────────────────────────────────────────────────────────────────────────

export type AssetClass = 'equity' | 'crypto' | 'fx' | 'commodity' | 'rate'

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  equity:    'Equity',
  crypto:    'Crypto',
  fx:        'FX',
  commodity: 'Commodity',
  rate:      'Rate',
}

export interface ClassifiedSymbol {
  /** Raw caller-supplied input (upper-cased, trimmed). */
  input: string
  assetClass: AssetClass
  /** Canonical display symbol, e.g. BTC-USD, EUR/USD, GOLD, US10Y, AAPL. */
  symbol: string
  /** Human-readable name where we know it. */
  name: string
  /** Yahoo Finance chart symbol (keyless fallback), null for equities. */
  yahoo: string | null
  /** Twelve Data symbol where applicable. */
  twelvedata?: string | null
  /** FRED series id for rates. */
  fred?: string | null
  /** Base/quote for crypto + fx pairs. */
  base?: string
  quote?: string
  /** Number of decimals the UI should render the price at. */
  decimals: number
  /** Unit suffix for display, e.g. '%', '/oz', '/bbl'. */
  unit?: string
}

// ─── Currency + crypto reference sets ────────────────────────────────────────

const FIAT = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'CNH',
  'HKD', 'SGD', 'SEK', 'NOK', 'DKK', 'MXN', 'BRL', 'ZAR', 'INR', 'KRW',
  'TRY', 'PLN', 'RUB', 'THB', 'IDR', 'TWD', 'CZK', 'HUF', 'ILS', 'CLP',
])

const CRYPTO_QUOTE = new Set(['USD', 'USDT', 'USDC', 'EUR', 'GBP', 'BTC', 'ETH'])

// Common crypto base assets — used to disambiguate 6-char concatenations like
// BTCUSD (crypto) from EURUSD (fx).
const CRYPTO_BASE: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', ADA: 'Cardano',
  DOGE: 'Dogecoin', DOT: 'Polkadot', AVAX: 'Avalanche', MATIC: 'Polygon',
  LINK: 'Chainlink', LTC: 'Litecoin', BCH: 'Bitcoin Cash', UNI: 'Uniswap',
  ATOM: 'Cosmos', XLM: 'Stellar', ALGO: 'Algorand', TRX: 'TRON', ETC: 'Ethereum Classic',
  FIL: 'Filecoin', NEAR: 'NEAR', APT: 'Aptos', ARB: 'Arbitrum', OP: 'Optimism',
  SHIB: 'Shiba Inu', PEPE: 'Pepe', SUI: 'Sui', INJ: 'Injective', TON: 'Toncoin',
  BNB: 'BNB', USDT: 'Tether', USDC: 'USD Coin',
}

// ─── Commodity catalog ───────────────────────────────────────────────────────

interface CommodityDef { name: string; yahoo: string; twelvedata?: string; unit?: string; decimals?: number }

const COMMODITIES: Record<string, CommodityDef> = {
  GOLD:      { name: 'Gold',            yahoo: 'GC=F', twelvedata: 'XAU/USD', unit: '/oz' },
  SILVER:    { name: 'Silver',          yahoo: 'SI=F', twelvedata: 'XAG/USD', unit: '/oz', decimals: 3 },
  PLATINUM:  { name: 'Platinum',        yahoo: 'PL=F', unit: '/oz' },
  PALLADIUM: { name: 'Palladium',       yahoo: 'PA=F', unit: '/oz' },
  COPPER:    { name: 'Copper',          yahoo: 'HG=F', unit: '/lb', decimals: 3 },
  WTI:       { name: 'WTI Crude Oil',   yahoo: 'CL=F', unit: '/bbl' },
  BRENT:     { name: 'Brent Crude Oil', yahoo: 'BZ=F', unit: '/bbl' },
  NATGAS:    { name: 'Natural Gas',     yahoo: 'NG=F', unit: '/MMBtu', decimals: 3 },
  GASOLINE:  { name: 'RBOB Gasoline',   yahoo: 'RB=F', unit: '/gal', decimals: 3 },
  CORN:      { name: 'Corn',            yahoo: 'ZC=F', unit: '/bu' },
  WHEAT:     { name: 'Wheat',           yahoo: 'ZW=F', unit: '/bu' },
  SOYBEAN:   { name: 'Soybeans',        yahoo: 'ZS=F', unit: '/bu' },
  SUGAR:     { name: 'Sugar',           yahoo: 'SB=F', unit: '/lb', decimals: 3 },
  COFFEE:    { name: 'Coffee',          yahoo: 'KC=F', unit: '/lb' },
  COCOA:     { name: 'Cocoa',           yahoo: 'CC=F', unit: '/t' },
  COTTON:    { name: 'Cotton',          yahoo: 'CT=F', unit: '/lb', decimals: 3 },
}

// Aliases → canonical commodity key
const COMMODITY_ALIAS: Record<string, string> = {
  XAU: 'GOLD', XAUUSD: 'GOLD',
  XAG: 'SILVER', XAGUSD: 'SILVER',
  XPT: 'PLATINUM', XPD: 'PALLADIUM',
  OIL: 'WTI', CRUDE: 'WTI', WTICRUDE: 'WTI',
  BRENTCRUDE: 'BRENT',
  NATURALGAS: 'NATGAS', GAS: 'NATGAS', NG: 'NATGAS',
  SOYBEANS: 'SOYBEAN', SOY: 'SOYBEAN',
}

// Yahoo futures symbol (e.g. GC=F) → canonical key
const YAHOO_FUTURE: Record<string, string> = Object.fromEntries(
  Object.entries(COMMODITIES).map(([k, v]) => [v.yahoo, k]),
)

// ─── Treasury / rate catalog ─────────────────────────────────────────────────

interface RateDef { name: string; fred: string; yahoo?: string; tenor: string }

const RATES: Record<string, RateDef> = {
  US1M:  { name: 'US 1-Month Treasury',  fred: 'DGS1MO', tenor: '1M' },
  US3M:  { name: 'US 3-Month Treasury',  fred: 'DGS3MO', yahoo: '^IRX', tenor: '3M' },
  US6M:  { name: 'US 6-Month Treasury',  fred: 'DGS6MO', tenor: '6M' },
  US1Y:  { name: 'US 1-Year Treasury',   fred: 'DGS1',   tenor: '1Y' },
  US2Y:  { name: 'US 2-Year Treasury',   fred: 'DGS2',   tenor: '2Y' },
  US3Y:  { name: 'US 3-Year Treasury',   fred: 'DGS3',   tenor: '3Y' },
  US5Y:  { name: 'US 5-Year Treasury',   fred: 'DGS5',   yahoo: '^FVX', tenor: '5Y' },
  US7Y:  { name: 'US 7-Year Treasury',   fred: 'DGS7',   tenor: '7Y' },
  US10Y: { name: 'US 10-Year Treasury',  fred: 'DGS10',  yahoo: '^TNX', tenor: '10Y' },
  US20Y: { name: 'US 20-Year Treasury',  fred: 'DGS20',  tenor: '20Y' },
  US30Y: { name: 'US 30-Year Treasury',  fred: 'DGS30',  yahoo: '^TYX', tenor: '30Y' },
}

const RATE_ALIAS: Record<string, string> = {
  '^IRX': 'US3M', '^FVX': 'US5Y', '^TNX': 'US10Y', '^TYX': 'US30Y',
  UST10Y: 'US10Y', UST2Y: 'US2Y', UST30Y: 'US30Y', UST5Y: 'US5Y',
  DGS10: 'US10Y', DGS2: 'US2Y', DGS30: 'US30Y', DGS5: 'US5Y', DGS3MO: 'US3M',
  '10Y': 'US10Y', '2Y': 'US2Y', '30Y': 'US30Y', '5Y': 'US5Y',
}

export function commodityKeys(): string[] { return Object.keys(COMMODITIES) }
export function rateKeys(): string[] { return Object.keys(RATES) }

// ─── Classifier ──────────────────────────────────────────────────────────────

function fxResult(input: string, base: string, quote: string): ClassifiedSymbol {
  return {
    input, assetClass: 'fx', symbol: `${base}/${quote}`,
    name: `${base}/${quote}`, yahoo: `${base}${quote}=X`,
    twelvedata: `${base}/${quote}`, base, quote, decimals: 4,
  }
}

function cryptoResult(input: string, base: string, quote: string): ClassifiedSymbol {
  return {
    input, assetClass: 'crypto', symbol: `${base}-${quote}`,
    name: CRYPTO_BASE[base] ? `${CRYPTO_BASE[base]} / ${quote}` : `${base}/${quote}`,
    yahoo: `${base}-${quote}`, twelvedata: `${base}/${quote}`,
    base, quote, decimals: quote === 'USD' || quote === 'USDT' || quote === 'USDC' ? 2 : 6,
  }
}

function commodityResult(input: string, key: string): ClassifiedSymbol {
  const d = COMMODITIES[key]
  return {
    input, assetClass: 'commodity', symbol: key, name: d.name,
    yahoo: d.yahoo, twelvedata: d.twelvedata ?? null,
    decimals: d.decimals ?? 2, unit: d.unit,
  }
}

function rateResult(input: string, key: string): ClassifiedSymbol {
  const d = RATES[key]
  return {
    input, assetClass: 'rate', symbol: key, name: d.name,
    yahoo: d.yahoo ?? null, fred: d.fred, decimals: 3, unit: '%',
  }
}

/**
 * Classify a raw symbol into an asset class + canonical/provider forms.
 * Pure and synchronous — safe to call anywhere, no network or env access.
 */
export function classifySymbol(raw: string): ClassifiedSymbol {
  const input = String(raw || '').trim().toUpperCase()
  if (!input) return { input, assetClass: 'equity', symbol: input, name: input, yahoo: null, decimals: 2 }

  // Explicit provider prefixes -------------------------------------------------
  if (input.startsWith('X:') || input.startsWith('CRYPTO:')) {
    const body = input.split(':')[1] || ''
    const m = body.match(/^([A-Z0-9]{2,10})(USD|USDT|USDC|EUR|GBP|BTC|ETH)$/)
    if (m) return cryptoResult(input, m[1], m[2])
  }
  if (input.startsWith('C:') || input.startsWith('FX:')) {
    const body = input.split(':')[1] || ''
    const m = body.match(/^([A-Z]{3})([A-Z]{3})$/)
    if (m && FIAT.has(m[1]) && FIAT.has(m[2])) return fxResult(input, m[1], m[2])
  }
  // Explicit commodity namespace — the only way a *bare* commodity name (GOLD,
  // WTI, CORN, …) resolves to a commodity. Without the prefix these stay
  // equities, because many collide with real tickers (GOLD = Barrick Gold,
  // WTI = W&T Offshore, OIL/CORN = commodity ETFs). See classifier note below.
  if (input.startsWith('CMDTY:') || input.startsWith('COMMODITY:')) {
    const body = input.slice(input.indexOf(':') + 1)
    if (COMMODITIES[body]) return commodityResult(input, body)
    if (COMMODITY_ALIAS[body]) return commodityResult(input, COMMODITY_ALIAS[body])
    if (YAHOO_FUTURE[body]) return commodityResult(input, YAHOO_FUTURE[body])
    // Unknown commodity body — still force the commodity route via Yahoo.
    return { input, assetClass: 'commodity', symbol: body, name: body, yahoo: body, decimals: 2 }
  }
  // Explicit rate namespace (symmetry with CMDTY:; rate keys don't collide with
  // equities, so bare US10Y etc. are also accepted below).
  if (input.startsWith('RATE:') || input.startsWith('UST:')) {
    const body = input.slice(input.indexOf(':') + 1)
    if (RATES[body]) return rateResult(input, body)
    if (RATE_ALIAS[body]) return rateResult(input, RATE_ALIAS[body])
  }

  // Treasury yields ------------------------------------------------------------
  // Rate keys/aliases (US10Y, ^TNX, DGS10, 10Y) are never valid equity tickers,
  // so resolving them bare introduces no equity regression.
  if (RATES[input]) return rateResult(input, input)
  if (RATE_ALIAS[input]) return rateResult(input, RATE_ALIAS[input])

  // Commodities ----------------------------------------------------------------
  // Only *unambiguous* commodity forms resolve bare: Yahoo futures (GC=F) and
  // the generic futures shape (XX=F). Bare commodity *names* are intentionally
  // NOT matched here — they fall through to equity to preserve ticker lookups
  // like GOLD (Barrick) / WTI (W&T Offshore). Use the CMDTY: prefix or a
  // metal FX pair (XAU/USD, XAUUSD) to force commodity classification.
  if (YAHOO_FUTURE[input]) return commodityResult(input, YAHOO_FUTURE[input])
  if (/^[A-Z]{1,3}=F$/.test(input)) {
    // Unknown futures symbol — still treat as a commodity, route via Yahoo.
    return { input, assetClass: 'commodity', symbol: input, name: input, yahoo: input, decimals: 2 }
  }

  // Dashed pairs: BASE-QUOTE ---------------------------------------------------
  const dash = input.match(/^([A-Z0-9]{2,10})-([A-Z]{3,4})$/)
  if (dash) {
    const [, base, quote] = dash
    if (CRYPTO_QUOTE.has(quote) && (CRYPTO_BASE[base] || quote === 'USDT' || quote === 'USDC' || !FIAT.has(base))) {
      return cryptoResult(input, base, quote)
    }
    if (FIAT.has(base) && FIAT.has(quote)) return fxResult(input, base, quote)
  }

  // Slashed pairs: BASE/QUOTE --------------------------------------------------
  const slash = input.match(/^([A-Z0-9]{2,10})\/([A-Z]{3,4})$/)
  if (slash) {
    const [, base, quote] = slash
    if (COMMODITY_ALIAS[`${base}${quote}`]) return commodityResult(input, COMMODITY_ALIAS[`${base}${quote}`])
    if (CRYPTO_BASE[base] && CRYPTO_QUOTE.has(quote)) return cryptoResult(input, base, quote)
    if (FIAT.has(base) && FIAT.has(quote)) return fxResult(input, base, quote)
  }

  // 6-char concatenations: BASEQUOTE (EURUSD, BTCUSD, XAUUSD) -------------------
  const six = input.match(/^([A-Z]{3})([A-Z]{3})$/)
  if (six) {
    const [, base, quote] = six
    if (COMMODITY_ALIAS[input]) return commodityResult(input, COMMODITY_ALIAS[input])
    if (CRYPTO_BASE[base] && CRYPTO_QUOTE.has(quote)) return cryptoResult(input, base, quote)
    if (FIAT.has(base) && FIAT.has(quote)) return fxResult(input, base, quote)
  }

  // Default — equity (unchanged behaviour) -------------------------------------
  return { input, assetClass: 'equity', symbol: input, name: input, yahoo: null, decimals: 2 }
}

/** Convenience: just the asset class for a raw symbol. */
export function assetClassOf(raw: string): AssetClass {
  return classifySymbol(raw).assetClass
}

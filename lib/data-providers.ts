/**
 * Finsyt Data Provider Registry
 * ─────────────────────────────
 * Central waterfall config. Every API route imports from here.
 * Priority: Massive (Polygon) → FMP → EODHD → Finnhub → FRED
 */

export const PROVIDERS = {
  massive:    process.env.MASSIVE_API_KEY   || process.env.POLYGON_API_KEY || '',
  fmp:        process.env.FMP_API_KEY       || '',
  eodhd:      process.env.EODHD_API_KEY     || process.env.eodhd_api        || '',
  finnhub:    process.env.FINNHUB_API_KEY   || '',
  fred:       process.env.FRED_API_KEY      || '',
  alphav:     process.env.ALPHA_VANTAGE_API_KEY || '',
  sec:        process.env.SEC_API_KEY       || '',
  coresignal: process.env.CORESIGNAL_API_KEY|| '',
  openai:     process.env.OPENAI_API_KEY    || '',
  anthropic:  process.env.ANTHROPIC_API_KEY || '',
}

/** Which providers are live in this environment (for /api/health) */
export function providerStatus() {
  return Object.entries(PROVIDERS).map(([name, key]) => ({
    name,
    active:     !!key,
    keyPreview: key ? `${key.slice(0, 4)}...${key.slice(-4)}` : null,
  }))
}

/**
 * Waterfall: run sources in order, return first non-null result.
 */
export async function waterfall<T>(
  sources: Array<{ name: string; fn: () => Promise<T | null> }>,
  label?: string
): Promise<{ data: T; source: string } | null> {
  for (const { name, fn } of sources) {
    try {
      const result = await fn()
      if (result !== null && result !== undefined) {
        return { data: result, source: name }
      }
    } catch (err) {
      console.warn(`[finsyt:${label ?? '?'}] ${name} failed:`, (err as Error).message)
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Massive (Polygon.io) helpers
// ─────────────────────────────────────────────────────────────────────────────
const MASSIVE_BASE = 'https://api.polygon.io'

export async function massiveFetch(path: string, params: Record<string, string> = {}) {
  if (!PROVIDERS.massive) return null
  const url = new URL(`${MASSIVE_BASE}${path}`)
  url.searchParams.set('apiKey', PROVIDERS.massive)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { next: { revalidate: 60 } })
  if (!res.ok) throw new Error(`Massive ${path} HTTP ${res.status}`)
  return res.json()
}

/** Snapshot quote — real-time or latest */
export async function massiveQuote(symbol: string) {
  const data = await massiveFetch(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`)
  const snap = data?.results
  if (!snap) return null
  const day  = snap.day    || {}
  const prev = snap.prevDay|| {}
  return {
    symbol,
    price:     snap.day?.c || snap.lastTrade?.p || snap.lastQuote?.P || 0,
    change:    snap.todaysChange     || 0,
    changePct: snap.todaysChangePerc || 0,
    open:      day.o  || 0,
    high:      day.h  || 0,
    low:       day.l  || 0,
    prevClose: prev.c || 0,
    volume:    day.v  || 0,
    vwap:      day.vw || 0,
    source:    'massive',
  }
}

/** OHLCV bars */
export async function massiveAggs(
  symbol: string, from: string, to: string,
  multiplier = 1, timespan = 'day'
) {
  const data = await massiveFetch(
    `/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}`,
    { adjusted: 'true', sort: 'asc', limit: '5000' }
  )
  return data?.results || null
}

/** Ticker reference details */
export async function massiveTickerDetails(symbol: string) {
  const data = await massiveFetch(`/v3/reference/tickers/${symbol}`)
  return data?.results || null
}

/** News feed */
export async function massiveNews(symbol?: string, limit = 20) {
  const p: Record<string, string> = { limit: String(limit), sort: 'published_utc', order: 'desc' }
  if (symbol) p.ticker = symbol
  const data = await massiveFetch('/v2/reference/news', p)
  return data?.results || null
}

/** XBRL financials (income / balance / cash flow) — with source links */
export async function massiveFinancials(
  symbol: string,
  period: 'annual' | 'quarterly' = 'annual'
) {
  const data = await massiveFetch('/vX/reference/financials', {
    ticker:           symbol,
    timeframe:        period === 'annual' ? 'annual' : 'quarterly',
    include_sources:  'true',
    limit:            '20',
  })
  return data?.results || null
}

/** Dividends */
export async function massiveDividends(symbol: string) {
  const data = await massiveFetch('/v3/reference/dividends', { ticker: symbol, limit: '20' })
  return data?.results || null
}

/** Stock splits */
export async function massiveSplits(symbol: string) {
  const data = await massiveFetch('/v3/reference/splits', { ticker: symbol })
  return data?.results || null
}

/** Ticker search */
export async function massiveSearch(query: string, limit = 10) {
  const data = await massiveFetch('/v3/reference/tickers', {
    search: query, active: 'true', limit: String(limit), market: 'stocks',
  })
  return data?.results || null
}

/** Options chain snapshot */
export async function massiveOptionsChain(symbol: string) {
  const data = await massiveFetch(`/v3/snapshot/options/${symbol}`, { limit: '250' })
  return data?.results || null
}

/** Tick-level trades */
export async function massiveTrades(symbol: string, date: string, limit = 100) {
  const data = await massiveFetch(`/v3/trades/${symbol}`, {
    timestamp: date, limit: String(limit), sort: 'timestamp', order: 'desc',
  })
  return data?.results || null
}

/** Bid/ask quotes */
export async function massiveQuotes(symbol: string, date: string, limit = 100) {
  const data = await massiveFetch(`/v3/quotes/${symbol}`, {
    timestamp: date, limit: String(limit), sort: 'participant_timestamp', order: 'desc',
  })
  return data?.results || null
}

/** Technical indicators */
export async function massiveSMA(symbol: string, window = 50, timespan = 'day') {
  const data = await massiveFetch(`/v1/indicators/sma/${symbol}`, {
    timespan, window: String(window), series_type: 'close', limit: '100', adjusted: 'true',
  })
  return data?.results?.values || null
}
export async function massiveEMA(symbol: string, window = 20, timespan = 'day') {
  const data = await massiveFetch(`/v1/indicators/ema/${symbol}`, {
    timespan, window: String(window), series_type: 'close', limit: '100', adjusted: 'true',
  })
  return data?.results?.values || null
}
export async function massiveRSI(symbol: string, window = 14, timespan = 'day') {
  const data = await massiveFetch(`/v1/indicators/rsi/${symbol}`, {
    timespan, window: String(window), series_type: 'close', limit: '100', adjusted: 'true',
  })
  return data?.results?.values || null
}
export async function massiveMACD(symbol: string, timespan = 'day') {
  const data = await massiveFetch(`/v1/indicators/macd/${symbol}`, {
    timespan, series_type: 'close', limit: '100', adjusted: 'true',
  })
  return data?.results?.values || null
}

/** Forex last */
export async function massiveForex(from: string, to: string) {
  const data = await massiveFetch(`/v1/last/forex/${from}/${to}`)
  return data?.last || null
}

/** Crypto last trade */
export async function massiveCrypto(from: string, to = 'USD') {
  const data = await massiveFetch(`/v1/last/crypto/${from}/${to}`)
  return data?.last || null
}

/** Market status (open/closed) */
export async function massiveMarketStatus() {
  return massiveFetch('/v1/marketstatus/now')
}

/** US indices snapshot */
export async function massiveIndices() {
  const data = await massiveFetch('/v2/snapshot/locale/us/markets/indices/tickers', {
    tickers: 'I:SPX,I:NDX,I:DJI,I:VIX,I:RUT',
  })
  return data?.results || null
}

/** Screener / grouped tickers */
export async function massiveGrouped(date: string) {
  const data = await massiveFetch(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, {
    adjusted: 'true', include_otc: 'false',
  })
  return data?.results || null
}

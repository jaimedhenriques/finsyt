/**
 * Finsyt Data Provider Registry
 * ─────────────────────────────
 * Central waterfall config — all API routes import from here.
 *
 * Priority by data type:
 *   Real-time quotes  : Massive → FMP → Yahoo → EODHD → Finnhub → Alpha Vantage
 *   Historical bars   : Massive → FMP → EODHD → Marketstack → Alpha Vantage → Yahoo
 *   Fundamentals      : FMP → Massive (XBRL) → EODHD → Alpha Vantage
 *   News              : Massive → FMP → EODHD → Finnhub
 *   Search/tickers    : Massive → FMP → EODHD → Finnhub → Yahoo
 *   Forex/Crypto      : Massive → Alpha Vantage → EODHD → Yahoo
 *   International     : EODHD → Marketstack → Yahoo → Alpha Vantage
 *   Macro / FRED      : FRED → Alpha Vantage (forex/econ) → EODHD
 */

export const PROVIDERS = {
  massive:     process.env.MASSIVE_API_KEY      || process.env.POLYGON_API_KEY   || '',
  fmp:         process.env.FMP_API_KEY           || '',
  eodhd:       process.env.EODHD_API_KEY         || process.env.eodhd_api         || '',
  finnhub:     process.env.FINNHUB_API_KEY       || '',
  fred:        process.env.FRED_API_KEY          || '',
  alphav:      process.env.ALPHA_VANTAGE_API_KEY || '',
  marketstack: process.env.MARKETSTACK_API_KEY   || '',
  yahoo:       process.env.YAHOO_FINANCE_API_KEY || process.env.RAPIDAPI_KEY      || '',  // RapidAPI key
  sec:         process.env.SEC_API_KEY           || '',
  coresignal:  process.env.CORESIGNAL_API_KEY    || '',
  openai:      process.env.OPENAI_API_KEY        || '',
  anthropic:   process.env.ANTHROPIC_API_KEY     || '',
}

/** Health check — which providers are configured */
export function providerStatus() {
  return Object.entries(PROVIDERS).map(([name, key]) => ({
    name,
    active:     !!key,
    keyPreview: key ? `${key.slice(0, 4)}...${key.slice(-4)}` : null,
  }))
}

/**
 * Waterfall: run sources in order, return first non-null result.
 * Catches errors per-source so a broken provider never breaks the chain.
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
// Massive (Polygon.io) — primary for US real-time + technicals
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

export async function massiveQuote(symbol: string) {
  const data = await massiveFetch(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`)
  const snap = data?.results
  if (!snap) return null
  return {
    symbol,
    price:     snap.day?.c || snap.lastTrade?.p || snap.lastQuote?.P || 0,
    change:    snap.todaysChange     || 0,
    changePct: snap.todaysChangePerc || 0,
    open:      snap.day?.o  || 0,
    high:      snap.day?.h  || 0,
    low:       snap.day?.l  || 0,
    prevClose: snap.prevDay?.c || 0,
    volume:    snap.day?.v  || 0,
    vwap:      snap.day?.vw || 0,
    source:    'massive',
  }
}

export async function massiveAggs(symbol: string, from: string, to: string, multiplier = 1, timespan = 'day') {
  const data = await massiveFetch(
    `/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}`,
    { adjusted: 'true', sort: 'asc', limit: '5000' }
  )
  return data?.results || null
}

export async function massiveTickerDetails(symbol: string) {
  const data = await massiveFetch(`/v3/reference/tickers/${symbol}`)
  return data?.results || null
}

export async function massiveNews(symbol?: string, limit = 20) {
  const p: Record<string, string> = { limit: String(limit), sort: 'published_utc', order: 'desc' }
  if (symbol) p.ticker = symbol
  const data = await massiveFetch('/v2/reference/news', p)
  return data?.results || null
}

export async function massiveFinancials(symbol: string, period: 'annual' | 'quarterly' = 'annual') {
  const data = await massiveFetch('/vX/reference/financials', {
    ticker: symbol, timeframe: period === 'annual' ? 'annual' : 'quarterly',
    include_sources: 'true', limit: '20',
  })
  return data?.results || null
}

export async function massiveDividends(symbol: string) {
  const data = await massiveFetch('/v3/reference/dividends', { ticker: symbol, limit: '20' })
  return data?.results || null
}

export async function massiveSplits(symbol: string) {
  const data = await massiveFetch('/v3/reference/splits', { ticker: symbol })
  return data?.results || null
}

export async function massiveSearch(query: string, limit = 10) {
  const data = await massiveFetch('/v3/reference/tickers', {
    search: query, active: 'true', limit: String(limit), market: 'stocks',
  })
  return data?.results || null
}

export async function massiveOptionsChain(symbol: string) {
  const data = await massiveFetch(`/v3/snapshot/options/${symbol}`, { limit: '250' })
  return data?.results || null
}

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
export async function massiveMarketStatus() {
  return massiveFetch('/v1/marketstatus/now')
}
export async function massiveIndices() {
  const data = await massiveFetch('/v2/snapshot/locale/us/markets/indices/tickers', {
    tickers: 'I:SPX,I:NDX,I:DJI,I:VIX,I:RUT',
  })
  return data?.results || null
}
export async function massiveGrouped(date: string) {
  const data = await massiveFetch(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, {
    adjusted: 'true', include_otc: 'false',
  })
  return data?.results || null
}

// ─────────────────────────────────────────────────────────────────────────────
// Yahoo Finance (via RapidAPI) — best global coverage, free tier 500 req/mo
// ─────────────────────────────────────────────────────────────────────────────
const YAHOO_HOST = 'yahoo-finance166.p.rapidapi.com'

export async function yahooFetch(path: string, params: Record<string, string> = {}) {
  if (!PROVIDERS.yahoo) return null
  const url = new URL(`https://${YAHOO_HOST}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: {
      'x-rapidapi-host': YAHOO_HOST,
      'x-rapidapi-key':  PROVIDERS.yahoo,
    },
    next: { revalidate: 120 },
  })
  if (!res.ok) throw new Error(`Yahoo ${path} HTTP ${res.status}`)
  return res.json()
}

/** Quote — works for ALL global markets (LSE, TSX, ASX, Tokyo, etc.) */
export async function yahooQuote(symbol: string) {
  const data = await yahooFetch('/api/stock/get-quote', { symbol, region: 'US', lang: 'en-US' })
  const q = data?.quoteResponse?.result?.[0]
  if (!q) return null
  return {
    symbol:    q.symbol,
    price:     q.regularMarketPrice,
    change:    q.regularMarketChange,
    changePct: q.regularMarketChangePercent,
    open:      q.regularMarketOpen,
    high:      q.regularMarketDayHigh,
    low:       q.regularMarketDayLow,
    prevClose: q.regularMarketPreviousClose,
    volume:    q.regularMarketVolume,
    marketCap: q.marketCap,
    name:      q.longName || q.shortName || symbol,
    exchange:  q.fullExchangeName || q.exchange || '',
    currency:  q.currency || 'USD',
    pe:        q.trailingPE,
    eps:       q.epsTrailingTwelveMonths,
    yearHigh:  q.fiftyTwoWeekHigh,
    yearLow:   q.fiftyTwoWeekLow,
    source:    'yahoo',
  }
}

/** Historical bars — free, global */
export async function yahooHistory(symbol: string, period1: number, period2: number, interval = '1d') {
  const data = await yahooFetch('/api/stock/get-chart', {
    symbol, interval, period1: String(period1), period2: String(period2), range: '1y',
  })
  const chart = data?.chart?.result?.[0]
  if (!chart?.timestamp) return null
  const { timestamp, indicators } = chart
  const q = indicators?.quote?.[0] || {}
  return timestamp.map((t: number, i: number) => ({
    t: t * 1000, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i],
  })).filter((b: any) => b.c != null)
}

/** Search — global ticker coverage */
export async function yahooSearch(query: string, limit = 10) {
  const data = await yahooFetch('/api/stock/search', { q: query, quotesCount: String(limit), newsCount: '0' })
  return data?.quotes?.slice(0, limit) || null
}

/** Fundamentals summary */
export async function yahooSummary(symbol: string) {
  const data = await yahooFetch('/api/stock/get-financial-data', { symbol, region: 'US' })
  return data?.financialData || null
}

// ─────────────────────────────────────────────────────────────────────────────
// Alpha Vantage — real-time + forex + crypto + economic indicators
// ─────────────────────────────────────────────────────────────────────────────
const AV_BASE = 'https://www.alphavantage.co/query'

export async function alphaFetch(params: Record<string, string>) {
  if (!PROVIDERS.alphav) return null
  const url = new URL(AV_BASE)
  url.searchParams.set('apikey', PROVIDERS.alphav)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`AlphaVantage HTTP ${res.status}`)
  const data = await res.json()
  // AV returns error as a Note or Information field
  if (data['Note'] || data['Information']) throw new Error(data['Note'] || data['Information'])
  return data
}

export async function alphaQuote(symbol: string) {
  const data = await alphaFetch({ function: 'GLOBAL_QUOTE', symbol })
  const q = data?.['Global Quote']
  if (!q?.['05. price']) return null
  return {
    symbol,
    price:     parseFloat(q['05. price']),
    change:    parseFloat(q['09. change']),
    changePct: parseFloat(q['10. change percent']?.replace('%', '') || '0'),
    open:      parseFloat(q['02. open']),
    high:      parseFloat(q['03. high']),
    low:       parseFloat(q['04. low']),
    prevClose: parseFloat(q['08. previous close']),
    volume:    parseInt(q['06. volume']),
    source:    'alphav',
  }
}

export async function alphaHistory(symbol: string, outputsize = 'compact') {
  const data = await alphaFetch({ function: 'TIME_SERIES_DAILY_ADJUSTED', symbol, outputsize })
  const series = data?.['Time Series (Daily)']
  if (!series) return null
  return Object.entries(series).map(([date, v]: [string, any]) => ({
    t: new Date(date).getTime(),
    o: parseFloat(v['1. open']), h: parseFloat(v['2. high']),
    l: parseFloat(v['3. low']),  c: parseFloat(v['4. close']),
    v: parseInt(v['6. volume']),  adj: parseFloat(v['5. adjusted close']),
  })).sort((a, b) => a.t - b.t)
}

export async function alphaForex(from: string, to: string) {
  const data = await alphaFetch({ function: 'CURRENCY_EXCHANGE_RATE', from_currency: from, to_currency: to })
  const r = data?.['Realtime Currency Exchange Rate']
  if (!r) return null
  return {
    from, to,
    rate:      parseFloat(r['5. Exchange Rate']),
    bid:       parseFloat(r['8. Bid Price']),
    ask:       parseFloat(r['9. Ask Price']),
    timestamp: r['6. Last Refreshed'],
    source:    'alphav',
  }
}

export async function alphaCrypto(symbol: string, market = 'USD') {
  const data = await alphaFetch({ function: 'CURRENCY_EXCHANGE_RATE', from_currency: symbol, to_currency: market })
  const r = data?.['Realtime Currency Exchange Rate']
  if (!r) return null
  return { symbol, market, rate: parseFloat(r['5. Exchange Rate']), source: 'alphav' }
}

// Alpha Vantage fundamental helpers
export async function alphaOverview(symbol: string) {
  return alphaFetch({ function: 'OVERVIEW', symbol })
}
export async function alphaIncomeStatement(symbol: string) {
  return alphaFetch({ function: 'INCOME_STATEMENT', symbol })
}
export async function alphaBalanceSheet(symbol: string) {
  return alphaFetch({ function: 'BALANCE_SHEET', symbol })
}
export async function alphaCashFlow(symbol: string) {
  return alphaFetch({ function: 'CASH_FLOW', symbol })
}
export async function alphaEarnings(symbol: string) {
  return alphaFetch({ function: 'EARNINGS', symbol })
}

// Alpha Vantage technical indicators
export async function alphaSMA(symbol: string, period = 50, interval = 'daily') {
  const data = await alphaFetch({ function: 'SMA', symbol, interval, time_period: String(period), series_type: 'close' })
  const series = data?.['Technical Analysis: SMA']
  return series ? Object.entries(series).map(([date, v]: [string, any]) => ({
    t: new Date(date).getTime(), value: parseFloat(v.SMA),
  })).sort((a, b) => a.t - b.t) : null
}

// Alpha Vantage economic indicators (free)
export async function alphaEconomic(indicator: 'CPI' | 'UNEMPLOYMENT' | 'FEDERAL_FUNDS_RATE' | 'TREASURY_YIELD' | 'REAL_GDP') {
  return alphaFetch({ function: indicator })
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketstack — 60+ global exchanges, great for international
// ─────────────────────────────────────────────────────────────────────────────
const MS_BASE = 'http://api.marketstack.com/v1'

export async function marketstackFetch(path: string, params: Record<string, string> = {}) {
  if (!PROVIDERS.marketstack) return null
  const url = new URL(`${MS_BASE}${path}`)
  url.searchParams.set('access_key', PROVIDERS.marketstack)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`Marketstack ${path} HTTP ${res.status}`)
  const data = await res.json()
  if (data?.error) throw new Error(data.error.message || 'Marketstack error')
  return data
}

export async function marketstackQuote(symbol: string) {
  // Marketstack uses EOD data on free tier
  const data = await marketstackFetch('/eod/latest', { symbols: symbol, limit: '1' })
  const q = data?.data?.[0]
  if (!q?.close) return null
  return {
    symbol:    q.symbol,
    price:     q.close,
    open:      q.open,
    high:      q.high,
    low:       q.low,
    prevClose: q.adj_close || q.close,
    volume:    q.volume,
    date:      q.date,
    exchange:  q.exchange,
    source:    'marketstack',
  }
}

export async function marketstackHistory(symbol: string, from: string, to: string, limit = 365) {
  const data = await marketstackFetch('/eod', {
    symbols: symbol, date_from: from, date_to: to, limit: String(limit),
  })
  const bars = data?.data || []
  return bars.map((b: any) => ({
    t: new Date(b.date).getTime(),
    o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume, adj: b.adj_close,
  })).sort((a: any, b: any) => a.t - b.t)
}

export async function marketstackSearch(query: string, limit = 10) {
  const data = await marketstackFetch('/tickers', { search: query, limit: String(limit) })
  return data?.data || null
}

export async function marketstackExchanges() {
  const data = await marketstackFetch('/exchanges', { limit: '50' })
  return data?.data || null
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared currency / exchange detection utility
// ─────────────────────────────────────────────────────────────────────────────

/** Detect if a symbol is likely international (non-US) */
export function isInternationalSymbol(symbol: string): boolean {
  // LSE: .L  TSX: .TO  ASX: .AX  Euronext: .PA .AS  Frankfurt: .DE  etc.
  return /\.(L|TO|AX|PA|AS|DE|HK|T|NS|BO|BR|MC|MI|SW|OL|ST|HE|CO|LS|IR|AT|WA|PR|BU|MX|SA|SN|BA|LM|TL|CR|NZ|SG|KS|TW|SS|SZ)$/i.test(symbol)
    || symbol.includes(':')
}

/** Normalise symbol for EODHD (adds .US if bare US ticker) */
export function toEODSymbol(symbol: string): string {
  return symbol.includes('.') || symbol.includes(':') ? symbol : `${symbol}.US`
}

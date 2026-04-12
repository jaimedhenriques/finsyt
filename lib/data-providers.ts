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
  own:         process.env.OPENWEBNINJA_API_KEY   || '',  // OpenWebNinja native key
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

// ─────────────────────────────────────────────────────────────────────────────
// OpenWebNinja Real-Time Finance Data API  (Google Finance source)
// ─────────────────────────────────────────────────────────────────────────────
// Docs: https://www.openwebninja.com/api/real-time-finance-data/docs
// Base: https://api.openwebninja.com/realtime-finance-data
// Auth: x-api-key header (lowercase, as specified in OAS 3.0.3 docs)
//
// Symbol format: TICKER:EXCHANGE   e.g. AAPL:NASDAQ  TSLA:NASDAQ  HSBA:LON
// Exchange codes from Google Finance: NASDAQ NYSE LON ETR EPA AMS TYO HKEX TSX ASX
//
// Endpoints (confirmed from OAS 3.0.3 docs):
//   GET /search?query=                             → stocks, ETFs, indices, forex, crypto
//   GET /market-trends?trend_type=                 → MARKET_INDEXES|MOST_ACTIVE|GAINERS|LOSERS|CRYPTO|CURRENCIES|CLIMATE_LEADERS
//   GET /stock-quote?symbol=                       → real-time price + pre/post market
//   GET /stock-time-series?symbol=&period=         → chart bars + key events (1D|5D|1M|6M|YTD|1Y|5Y|MAX)
//   GET /stock-news?symbol=                        → related news articles
//   GET /stock-overview?symbol=                    → company overview / fundamentals
//   GET /stock-income-statement?symbol=            → quarterly + annual P&L
//   GET /stock-balance-sheet?symbol=               → quarterly + annual balance sheet
//   GET /stock-cash-flow?symbol=                   → quarterly + annual cash flow
//   GET /currency-exchange-rate?from_symbol=&to_symbol=  → forex rate
//   GET /currency-time-series?from_symbol=&to_symbol=&period=
//   GET /currency-news?from_symbol=&to_symbol=
//   GET /stock-quote-yahoo?symbol=                 → Yahoo Finance quote (no :EXCHANGE needed)
//   GET /stock-time-series-yahoo?symbol=&period=   → Yahoo Finance chart
// ─────────────────────────────────────────────────────────────────────────────

const OWN_BASE = 'https://api.openwebninja.com/realtime-finance-data'

/** Convert bare ticker to TICKER:EXCHANGE format for OWN API */
export function ownSymbol(symbol: string, exchange?: string): string {
  if (symbol.includes(':')) return symbol  // already formatted

  // Common Google Finance exchange codes by suffix
  const suffixMap: Record<string, string> = {
    '.L':   'LON',   // London Stock Exchange
    '.TO':  'TSX',   // Toronto Stock Exchange
    '.AX':  'ASX',   // Australian Securities Exchange
    '.PA':  'EPA',   // Euronext Paris
    '.AS':  'AMS',   // Euronext Amsterdam
    '.DE':  'ETR',   // Deutsche Börse (Xetra)
    '.MI':  'BIT',   // Borsa Italiana
    '.MC':  'BME',   // Bolsa de Madrid
    '.HK':  'HKEX',  // Hong Kong Exchange
    '.T':   'TYO',   // Tokyo Stock Exchange
    '.NS':  'NSE',   // National Stock Exchange India
    '.BO':  'BSE',   // Bombay Stock Exchange
    '.SS':  'SHA',   // Shanghai Stock Exchange
    '.SZ':  'SHE',   // Shenzhen Stock Exchange
    '.SW':  'VTX',   // SIX Swiss Exchange
    '.BR':  'EBR',   // Euronext Brussels
    '.LS':  'ELI',   // Euronext Lisbon
    '.MX':  'BMV',   // Bolsa Mexicana de Valores
    '.SA':  'BVMF',  // B3 Brazil
    '.NZ':  'NZX',   // New Zealand Exchange
  }

  for (const [suffix, exch] of Object.entries(suffixMap)) {
    if (symbol.toUpperCase().endsWith(suffix.toUpperCase())) {
      const ticker = symbol.slice(0, -suffix.length)
      return `${ticker.toUpperCase()}:${exch}`
    }
  }

  // Default: assume NASDAQ for bare US tickers, override with exchange param
  return `${symbol.toUpperCase()}:${exchange || 'NASDAQ'}`
}

/** Core fetcher — x-api-key (lowercase) as per OAS 3.0.3 docs */
export async function ownFetch(endpoint: string, params: Record<string, string> = {}) {
  if (!PROVIDERS.own) return null
  const url = new URL(`${OWN_BASE}/${endpoint}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  if (!params.language) url.searchParams.set('language', 'en')
  const res = await fetch(url.toString(), {
    headers: { 'x-api-key': PROVIDERS.own },
    next: { revalidate: 60 },
  })
  if (!res.ok) throw new Error(`OWN /${endpoint} HTTP ${res.status}`)
  const data = await res.json()
  if (data?.message === 'Unauthorized') throw new Error('OWN: Unauthorized — check OPENWEBNINJA_API_KEY')
  return data
}

// ─── Quote ───────────────────────────────────────────────────────────────────

/** Real-time stock/index/ETF/crypto quote — Google Finance source */
export async function ownQuote(symbol: string, exchange?: string) {
  const data = await ownFetch('stock-quote', { symbol: ownSymbol(symbol, exchange) })
  const q = data?.data
  if (!q?.price) return null
  return {
    symbol:                 q.symbol,
    name:                   q.name,
    type:                   q.type,
    price:                  q.price,
    open:                   q.open,
    high:                   q.high,
    low:                    q.low,
    volume:                 q.volume,
    prevClose:              q.previous_close,
    change:                 q.change,
    changePct:              q.change_percent,
    prePostMarket:          q.pre_or_post_market,
    prePostMarketChange:    q.pre_or_post_market_change,
    prePostMarketChangePct: q.pre_or_post_market_change_percent,
    currency:               q.currency,
    exchange:               q.exchange,
    exchangeOpen:           q.exchange_open,
    exchangeClose:          q.exchange_close,
    timezone:               q.timezone,
    countryCode:            q.country_code,
    lastUpdate:             q.last_update_utc,
    googleMid:              q.google_mid,
    source:                 'openwebninja',
  }
}

/** Yahoo Finance quote — use for symbols where :EXCHANGE is unknown */
export async function ownQuoteYahoo(symbol: string) {
  // No :EXCHANGE needed — Yahoo uses bare tickers (AAPL, TSLA, etc.)
  const data = await ownFetch('stock-quote-yahoo', { symbol: symbol.toUpperCase() })
  const q = data?.data
  if (!q?.price) return null
  return { ...q, source: 'openwebninja-yahoo' }
}

// ─── Time Series / Chart ──────────────────────────────────────────────────────

/** Chart bars with key events overlay */
export async function ownTimeSeries(symbol: string, period = '1M', exchange?: string) {
  const data = await ownFetch('stock-time-series', {
    symbol: ownSymbol(symbol, exchange),
    period,  // 1D | 5D | 1M | 6M | YTD | 1Y | 5Y | MAX
  })
  const d = data?.data
  if (!d?.time_series) return null
  const bars = Object.entries(d.time_series).map(([ts, v]: [string, any]) => ({
    t: new Date(ts).getTime(), c: v.price, ch: v.change, chPct: v.change_percent, v: v.volume ?? null,
  })).sort((a, b) => a.t - b.t)
  return {
    symbol:    d.symbol, price: d.price, prevClose: d.previous_close,
    change:    d.change, changePct: d.change_percent,
    period:    d.period, intervalSec: d.interval_sec,
    bars,      keyEvents: d.key_events || [],
    source:    'openwebninja',
  }
}

/** Yahoo Finance time series (bare tickers, no :EXCHANGE) */
export async function ownTimeSeriesYahoo(symbol: string, period = '1M') {
  const data = await ownFetch('stock-time-series-yahoo', { symbol: symbol.toUpperCase(), period })
  const d = data?.data
  if (!d?.time_series) return null
  const bars = Object.entries(d.time_series).map(([ts, v]: [string, any]) => ({
    t: new Date(ts).getTime(), c: v.price, ch: v.change, chPct: v.change_percent, v: v.volume ?? null,
  })).sort((a, b) => a.t - b.t)
  return { ...d, bars, source: 'openwebninja-yahoo' }
}

// ─── News ─────────────────────────────────────────────────────────────────────

export async function ownNews(symbol: string, exchange?: string) {
  const data = await ownFetch('stock-news', { symbol: ownSymbol(symbol, exchange) })
  const articles = data?.data
  return Array.isArray(articles) ? articles.map((a: any) => ({
    title:       a.article_title,
    url:         a.article_url,
    image:       a.article_photo_url,
    source:      a.source,
    publishedAt: a.post_time_utc,
    dataSource:  'openwebninja',
  })) : null
}

// ─── Fundamentals ─────────────────────────────────────────────────────────────

export async function ownOverview(symbol: string, exchange?: string) {
  const data = await ownFetch('stock-overview', { symbol: ownSymbol(symbol, exchange) })
  return data?.data || null
}

export async function ownIncomeStatement(symbol: string, exchange?: string) {
  const data = await ownFetch('stock-income-statement', { symbol: ownSymbol(symbol, exchange) })
  return Array.isArray(data?.data) ? data.data : null
}

export async function ownBalanceSheet(symbol: string, exchange?: string) {
  const data = await ownFetch('stock-balance-sheet', { symbol: ownSymbol(symbol, exchange) })
  return Array.isArray(data?.data) ? data.data : null
}

export async function ownCashFlow(symbol: string, exchange?: string) {
  const data = await ownFetch('stock-cash-flow', { symbol: ownSymbol(symbol, exchange) })
  return Array.isArray(data?.data) ? data.data : null
}

// ─── Market Trends ────────────────────────────────────────────────────────────

export type OwnTrendType = 'MARKET_INDEXES' | 'MOST_ACTIVE' | 'GAINERS' | 'LOSERS' | 'CRYPTO' | 'CURRENCIES' | 'CLIMATE_LEADERS'

export async function ownMarketTrends(trend_type: OwnTrendType = 'GAINERS', country = 'us') {
  const data = await ownFetch('market-trends', { trend_type, country })
  return data?.data?.trends || null
}

// ─── Forex / Currency ─────────────────────────────────────────────────────────

export async function ownForex(from: string, to: string) {
  const data = await ownFetch('currency-exchange-rate', { from_symbol: from, to_symbol: to })
  const d = data?.data
  if (!d?.exchange_rate) return null
  return {
    from:       d.from_symbol,
    to:         d.to_symbol,
    rate:       d.exchange_rate,
    prevClose:  d.previous_close,
    lastUpdate: d.last_update_utc,
    source:     'openwebninja',
  }
}

export async function ownForexTimeSeries(from: string, to: string, period = '1M') {
  const data = await ownFetch('currency-time-series', { from_symbol: from, to_symbol: to, period })
  return data?.data || null
}

export async function ownCurrencyNews(from: string, to: string) {
  const data = await ownFetch('currency-news', { from_symbol: from, to_symbol: to })
  return data?.data || null
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function ownSearch(query: string) {
  const data = await ownFetch('search', { query })
  const d = data?.data
  if (!d) return null
  // Flatten all asset types into a single array
  const all = [
    ...(d.stock        || []),
    ...(d.ETF          || []),
    ...(d.index        || []),
    ...(d.mutual_fund  || []),
    ...(d.currency     || []),
    ...(d.futures      || []),
  ]
  return all.map((r: any) => ({
    symbol:    r.symbol,
    name:      r.name,
    type:      r.type,
    price:     r.price,
    change:    r.change,
    changePct: r.change_percent,
    exchange:  r.exchange || '',
    currency:  r.currency || '',
    country:   r.country_code || '',
    source:    'openwebninja',
  }))
}

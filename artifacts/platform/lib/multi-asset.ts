// ─────────────────────────────────────────────────────────────────────────────
// Multi-asset quote / history resolvers
// ─────────────────────────────────────────────────────────────────────────────
// Given a non-equity ClassifiedSymbol (crypto, fx, commodity, rate), resolve a
// normalised quote or daily-bar history using Finsyt's existing provider
// waterfall plus a keyless Yahoo public-chart fallback so the surface works in
// preview environments without paid keys.
//
// Every returned quote carries `source` attribution (same convention as the
// equity waterfall) and an `assetClass` tag. Credential-health hooks are
// inherited for free because we call the existing provider functions
// (twelvedataQuote, alphaForex, alphaCrypto, massiveFetch, fredFetch) which
// already record key acceptance/rejection.
// ─────────────────────────────────────────────────────────────────────────────

import {
  PROVIDERS, massiveFetch, twelvedataQuote, twelvedataTimeSeries,
  alphaForex, alphaCrypto, fredFetch,
} from './data-providers'
import type { AssetClass, ClassifiedSymbol } from './asset-class'
import { ASSET_CLASS_LABEL } from './asset-class'

export interface MultiAssetQuote {
  symbol: string
  name: string
  assetClass: AssetClass
  assetType: string
  price: number
  change: number
  changePct: number
  open?: number
  high?: number
  low?: number
  prevClose?: number
  volume?: number
  /** FX rate / yield mirror of `price` for callers that key off these names. */
  rate?: number
  yield?: number
  unit?: string
  decimals: number
  base?: string
  quote?: string
  spark?: number[]
  asOf?: string
  source: string
}

export interface MultiAssetBars {
  symbol: string
  assetClass: AssetClass
  bars: Array<{ t: number; o?: number; h?: number; l?: number; c: number; v?: number }>
  source: string
}

// ─── Keyless Yahoo public chart ──────────────────────────────────────────────

interface YahooChart {
  meta: Record<string, number | string>
  closes: number[]
  bars: Array<{ t: number; o?: number; h?: number; l?: number; c: number; v?: number }>
}

async function yahooPublicChart(symbol: string, range = '1mo', interval = '1d'): Promise<YahooChart | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 60 },
  })
  if (!res.ok) throw new Error(`Yahoo chart ${symbol} HTTP ${res.status}`)
  const data = await res.json()
  const result = data?.chart?.result?.[0]
  if (!result?.meta) return null
  const ts: number[] = result.timestamp || []
  const q = result.indicators?.quote?.[0] || {}
  const bars = ts.map((t: number, i: number) => ({
    t: t * 1000,
    o: q.open?.[i] ?? undefined,
    h: q.high?.[i] ?? undefined,
    l: q.low?.[i] ?? undefined,
    c: q.close?.[i],
    v: q.volume?.[i] ?? undefined,
  })).filter((b: { c: number | null | undefined }) => b.c != null) as YahooChart['bars']
  return { meta: result.meta, closes: bars.map(b => b.c), bars }
}

function quoteFromYahoo(c: ClassifiedSymbol, chart: YahooChart): MultiAssetQuote {
  const m = chart.meta
  const price = Number(m.regularMarketPrice) || chart.closes[chart.closes.length - 1] || 0
  const prev = Number(m.chartPreviousClose) || Number(m.previousClose) || chart.closes[chart.closes.length - 2] || 0
  const change = price - prev
  const lastBar = chart.bars[chart.bars.length - 1]
  return finalize(c, {
    price,
    change,
    changePct: prev ? (change / prev) * 100 : 0,
    open: lastBar?.o,
    high: Number(m.regularMarketDayHigh) || lastBar?.h || undefined,
    low: Number(m.regularMarketDayLow) || lastBar?.l || undefined,
    prevClose: prev,
    volume: Number(m.regularMarketVolume) || undefined,
    spark: chart.closes.slice(-30),
    asOf: m.regularMarketTime ? new Date(Number(m.regularMarketTime) * 1000).toISOString() : undefined,
    source: 'yahoo',
  })
}

function finalize(c: ClassifiedSymbol, partial: Omit<MultiAssetQuote, 'symbol' | 'name' | 'assetClass' | 'assetType' | 'decimals' | 'unit' | 'base' | 'quote'>): MultiAssetQuote {
  const q: MultiAssetQuote = {
    symbol: c.symbol,
    name: c.name,
    assetClass: c.assetClass,
    assetType: ASSET_CLASS_LABEL[c.assetClass],
    decimals: c.decimals,
    unit: c.unit,
    base: c.base,
    quote: c.quote,
    ...partial,
  }
  if (c.assetClass === 'fx') q.rate = q.price
  if (c.assetClass === 'rate') q.yield = q.price
  return q
}

// ─── Per-class quote resolvers ───────────────────────────────────────────────

async function resolveCrypto(c: ClassifiedSymbol): Promise<MultiAssetQuote | null> {
  const pair = `${c.base}${c.quote}`
  if (PROVIDERS.massive) {
    try {
      const data = await massiveFetch(`/v2/snapshot/locale/global/markets/crypto/tickers/X:${pair}`)
      const t = data?.ticker
      if (t?.lastTrade?.p || t?.day?.c) {
        const price = t.lastTrade?.p || t.day?.c
        return finalize(c, {
          price,
          change: t.todaysChange || 0,
          changePct: t.todaysChangePerc || 0,
          open: t.day?.o, high: t.day?.h, low: t.day?.l,
          prevClose: t.prevDay?.c, volume: t.day?.v,
          source: 'massive',
        })
      }
    } catch { /* next */ }
  }
  if (PROVIDERS.twelvedata && c.twelvedata) {
    try { const q = await twelvedataQuote(c.twelvedata); if (q?.price) return mapTd(c, q) } catch { /* next */ }
  }
  if (PROVIDERS.alphav && c.base && c.quote) {
    try {
      const r = await alphaCrypto(c.base, c.quote)
      if (r?.rate) return finalize(c, { price: r.rate, change: 0, changePct: 0, source: 'alphav' })
    } catch { /* next */ }
  }
  return yahooFallback(c)
}

async function resolveFx(c: ClassifiedSymbol): Promise<MultiAssetQuote | null> {
  if (PROVIDERS.massive && c.base && c.quote) {
    try {
      const data = await massiveFetch(`/v1/last/forex/${c.base}/${c.quote}`)
      if (data?.last?.exchange) {
        return finalize(c, { price: data.last.exchange, change: 0, changePct: 0, source: 'massive' })
      }
    } catch { /* next */ }
  }
  if (PROVIDERS.alphav && c.base && c.quote) {
    try {
      const r = await alphaForex(c.base, c.quote)
      if (r?.rate) return finalize(c, { price: r.rate, change: 0, changePct: 0, source: 'alphav' })
    } catch { /* next */ }
  }
  if (PROVIDERS.twelvedata && c.twelvedata) {
    try { const q = await twelvedataQuote(c.twelvedata); if (q?.price) return mapTd(c, q) } catch { /* next */ }
  }
  return yahooFallback(c)
}

async function resolveCommodity(c: ClassifiedSymbol): Promise<MultiAssetQuote | null> {
  if (PROVIDERS.twelvedata && c.twelvedata) {
    try { const q = await twelvedataQuote(c.twelvedata); if (q?.price) return mapTd(c, q) } catch { /* next */ }
  }
  return yahooFallback(c)
}

async function resolveRate(c: ClassifiedSymbol): Promise<MultiAssetQuote | null> {
  if (PROVIDERS.fred && c.fred) {
    try {
      const data = await fredFetch('/fred/series/observations', {
        series_id: c.fred, sort_order: 'desc', limit: '5',
      })
      const obs: Array<{ date: string; value: string }> = data?.observations || []
      const valid = obs.filter(o => o.value && o.value !== '.')
      if (valid.length) {
        const price = parseFloat(valid[0].value)
        const prev = valid[1] ? parseFloat(valid[1].value) : price
        return finalize(c, {
          price, change: price - prev,
          changePct: prev ? ((price - prev) / prev) * 100 : 0,
          prevClose: prev, asOf: valid[0].date, source: 'fred',
        })
      }
    } catch { /* next */ }
  }
  return yahooFallback(c)
}

async function yahooFallback(c: ClassifiedSymbol): Promise<MultiAssetQuote | null> {
  if (!c.yahoo) return null
  try {
    const chart = await yahooPublicChart(c.yahoo, '1mo', '1d')
    if (chart) return quoteFromYahoo(c, chart)
  } catch { /* give up */ }
  return null
}

function mapTd(c: ClassifiedSymbol, q: { price: number; change: number; changePct: number; open?: number; high?: number; low?: number; prevClose?: number; volume?: number }): MultiAssetQuote {
  return finalize(c, {
    price: q.price, change: q.change, changePct: q.changePct,
    open: q.open, high: q.high, low: q.low, prevClose: q.prevClose, volume: q.volume,
    source: 'twelvedata',
  })
}

/**
 * Resolve a normalised quote for a non-equity classified symbol.
 * Returns null for equities (caller should use the existing equity waterfall)
 * or when every provider is exhausted.
 */
export async function resolveMultiAssetQuote(c: ClassifiedSymbol): Promise<MultiAssetQuote | null> {
  switch (c.assetClass) {
    case 'crypto':    return resolveCrypto(c)
    case 'fx':        return resolveFx(c)
    case 'commodity': return resolveCommodity(c)
    case 'rate':      return resolveRate(c)
    default:          return null
  }
}

// ─── History ─────────────────────────────────────────────────────────────────

function rangeForSpan(from: string, to: string): string {
  const days = (new Date(to).getTime() - new Date(from).getTime()) / 86400000
  if (days <= 7) return '5d'
  if (days <= 31) return '1mo'
  if (days <= 93) return '3mo'
  if (days <= 186) return '6mo'
  if (days <= 372) return '1y'
  if (days <= 750) return '2y'
  if (days <= 1850) return '5y'
  return 'max'
}

/** Resolve daily bars for a non-equity classified symbol. */
export async function resolveMultiAssetHistory(c: ClassifiedSymbol, from: string, to: string): Promise<MultiAssetBars | null> {
  const fromT = new Date(from).getTime()
  const toT = new Date(to).getTime() + 86400000

  if (PROVIDERS.twelvedata && c.twelvedata && (c.assetClass === 'crypto' || c.assetClass === 'fx' || c.assetClass === 'commodity')) {
    try {
      const bars = await twelvedataTimeSeries(c.twelvedata, '1day', 5000)
      const filtered = (bars || []).filter((b: { t: number }) => b.t >= fromT && b.t <= toT)
      if (filtered.length) return { symbol: c.symbol, assetClass: c.assetClass, bars: filtered, source: 'twelvedata' }
    } catch { /* next */ }
  }

  if (c.yahoo) {
    try {
      const chart = await yahooPublicChart(c.yahoo, rangeForSpan(from, to), '1d')
      const filtered = (chart?.bars || []).filter(b => b.t >= fromT && b.t <= toT)
      if (filtered.length) return { symbol: c.symbol, assetClass: c.assetClass, bars: filtered, source: 'yahoo' }
    } catch { /* next */ }
  }

  if (c.assetClass === 'rate' && PROVIDERS.fred && c.fred) {
    try {
      const data = await fredFetch('/fred/series/observations', {
        series_id: c.fred, observation_start: from, observation_end: to, sort_order: 'asc',
      })
      const obs: Array<{ date: string; value: string }> = data?.observations || []
      const bars = obs.filter(o => o.value && o.value !== '.').map(o => ({ t: new Date(o.date).getTime(), c: parseFloat(o.value) }))
      if (bars.length) return { symbol: c.symbol, assetClass: c.assetClass, bars, source: 'fred' }
    } catch { /* next */ }
  }

  return null
}

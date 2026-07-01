import { NextRequest, NextResponse } from 'next/server'
import { PROVIDERS, isInternationalSymbol, toEODSymbol, massiveAggs, yahooHistory, alphaHistory, marketstackHistory, twelvedataTimeSeries } from '@/lib/data-providers'
import { classifySymbol } from '@/lib/asset-class'
import { resolveMultiAssetHistory } from '@/lib/multi-asset'

const FMP   = PROVIDERS.fmp
const EODHD = PROVIDERS.eodhd

export async function GET(req: NextRequest) {
  const p          = req.nextUrl.searchParams
  const symbol     = p.get('symbol')?.toUpperCase()
  const from       = p.get('from') || new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
  const to         = p.get('to')   || new Date().toISOString().slice(0, 10)
  const multiplier = parseInt(p.get('multiplier') || '1')
  const timespan   = p.get('timespan') || 'day'

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  // Non-equity instruments (crypto, fx, commodity, rate) resolve through the
  // dedicated multi-asset history waterfall (keyless Yahoo + FRED + Twelve Data).
  const classified = classifySymbol(symbol)
  if (classified.assetClass !== 'equity') {
    const hist = await resolveMultiAssetHistory(classified, from, to).catch(() => null)
    if (hist?.bars?.length) {
      return NextResponse.json({
        symbol: classified.symbol, assetClass: classified.assetClass,
        from, to, timespan: 'day', multiplier: 1,
        bars: hist.bars, count: hist.bars.length, source: hist.source,
      })
    }
    return NextResponse.json({ error: 'All bar providers exhausted', symbol, assetClass: classified.assetClass }, { status: 503 })
  }

  const isIntl = isInternationalSymbol(symbol)

  // International symbols: skip Massive (US only), go straight to multi-provider
  if (!isIntl && PROVIDERS.massive) {
    try {
      const bars = await massiveAggs(symbol, from, to, multiplier, timespan)
      if (bars?.length) return NextResponse.json({ symbol, from, to, timespan, multiplier, bars: normaliseMassiveBars(bars), count: bars.length, source: 'massive' })
    } catch (e) { console.warn('[aggs] Massive failed:', (e as Error).message) }
  }

  // FMP (US daily only)
  if (FMP && timespan === 'day' && !isIntl) {
    try {
      const res  = await fetch(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&from=${from}&to=${to}&apikey=${FMP}`, { next: { revalidate: 3600 } })
      const data = await res.json()
      const hist = (data?.historical || []) as any[]
      if (hist.length) return NextResponse.json({ symbol, from, to, timespan: 'day', multiplier: 1, bars: hist.reverse().map((b: any) => ({ t: new Date(b.date).getTime(), o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume })), count: hist.length, source: 'fmp' })
    } catch (e) { console.warn('[aggs] FMP failed:', (e as Error).message) }
  }

  // Twelve Data (global coverage, generous free tier — slots after FMP/Massive)
  if (PROVIDERS.twelvedata) {
    try {
      const interval = timespan === 'minute' ? `${multiplier}min`
        : timespan === 'hour' ? `${multiplier}h`
        : timespan === 'week' ? '1week'
        : timespan === 'month' ? '1month'
        : '1day'
      const bars = await twelvedataTimeSeries(symbol, interval, 5000)
      const filtered = (bars || []).filter((b: { t: number }) =>
        b.t >= new Date(from).getTime() && b.t <= new Date(to).getTime() + 86400000
      )
      if (filtered.length) return NextResponse.json({ symbol, from, to, timespan, multiplier, bars: filtered, count: filtered.length, source: 'twelvedata' })
    } catch (e) { console.warn('[aggs] TwelveData failed:', (e as Error).message) }
  }

  // EODHD (global coverage)
  if (EODHD) {
    try {
      const eodSymbol = toEODSymbol(symbol)
      const url = `https://eodhd.com/api/eod/${eodSymbol}?api_token=${EODHD}&fmt=json&from=${from}&to=${to}`
      const res = await fetch(url, { next: { revalidate: 3600 } })
      const data = await res.json()
      if (Array.isArray(data) && data.length) return NextResponse.json({ symbol, from, to, timespan: 'day', multiplier: 1, bars: data.map((b: any) => ({ t: new Date(b.date).getTime(), o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume, adj: b.adjusted_close })), count: data.length, source: 'eodhd' })
    } catch (e) { console.warn('[aggs] EODHD failed:', (e as Error).message) }
  }

  // Marketstack (60+ exchanges, good intl coverage)
  if (PROVIDERS.marketstack) {
    try {
      const bars = await marketstackHistory(symbol, from, to)
      if (bars?.length) return NextResponse.json({ symbol, from, to, timespan: 'day', multiplier: 1, bars, count: bars.length, source: 'marketstack' })
    } catch (e) { console.warn('[aggs] Marketstack failed:', (e as Error).message) }
  }

  // Alpha Vantage daily
  if (PROVIDERS.alphav && timespan === 'day') {
    try {
      const bars = await alphaHistory(symbol, multiplier > 1 ? 'full' : 'compact')
      if (bars?.length) return NextResponse.json({ symbol, from, to, timespan: 'day', multiplier: 1, bars, count: bars.length, source: 'alphav' })
    } catch (e) { console.warn('[aggs] AlphaV failed:', (e as Error).message) }
  }

  // Yahoo Finance
  if (PROVIDERS.yahoo) {
    try {
      const p1 = Math.floor(new Date(from).getTime() / 1000)
      const p2 = Math.floor(new Date(to).getTime() / 1000)
      const bars = await yahooHistory(symbol, p1, p2, timespan === 'day' ? '1d' : timespan === 'week' ? '1wk' : '1mo')
      if (bars?.length) return NextResponse.json({ symbol, from, to, timespan, multiplier: 1, bars, count: bars.length, source: 'yahoo' })
    } catch (e) { console.warn('[aggs] Yahoo failed:', (e as Error).message) }
  }

  return NextResponse.json({ error: 'All bar providers exhausted', symbol }, { status: 503 })
}

function normaliseMassiveBars(bars: any[]) {
  return bars.map((b: any) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: b.vw, n: b.n }))
}

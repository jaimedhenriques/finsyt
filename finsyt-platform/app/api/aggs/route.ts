import { NextRequest, NextResponse } from 'next/server'
import { PROVIDERS, massiveAggs } from '@/lib/data-providers'

const FMP   = PROVIDERS.fmp
const EODHD = PROVIDERS.eodhd

export async function GET(req: NextRequest) {
  const p          = req.nextUrl.searchParams
  const symbol     = p.get('symbol')?.toUpperCase()
  const from       = p.get('from') || new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
  const to         = p.get('to')   || new Date().toISOString().slice(0, 10)
  const multiplier = parseInt(p.get('multiplier') || '1')
  const timespan   = p.get('timespan') || 'day' // minute | hour | day | week | month

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  // ── 1. Massive — nanosecond precision, all timespans ──────────────────────
  if (PROVIDERS.massive) {
    try {
      const bars = await massiveAggs(symbol, from, to, multiplier, timespan)
      if (bars && bars.length > 0) {
        return NextResponse.json({
          symbol, from, to, timespan, multiplier,
          bars: bars.map((b: any) => ({
            t: b.t, o: b.o, h: b.h, l: b.l, c: b.c,
            v: b.v, vw: b.vw, n: b.n,
          })),
          count: bars.length,
          source: 'massive',
        })
      }
    } catch (e) { console.warn('[aggs] Massive failed:', (e as Error).message) }
  }

  // ── 2. FMP historical daily ───────────────────────────────────────────────
  if (FMP && timespan === 'day') {
    try {
      const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&from=${from}&to=${to}&apikey=${FMP}`
      const res  = await fetch(url, { next: { revalidate: 3600 } })
      const data = await res.json()
      const hist = (data?.historical || []) as any[]
      if (hist.length > 0) {
        return NextResponse.json({
          symbol, from, to, timespan: 'day', multiplier: 1,
          bars: hist.reverse().map((b: any) => ({
            t: new Date(b.date).getTime(),
            o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume,
          })),
          count: hist.length,
          source: 'fmp',
        })
      }
    } catch (e) { console.warn('[aggs] FMP failed:', (e as Error).message) }
  }

  // ── 3. EODHD historical ───────────────────────────────────────────────────
  if (EODHD) {
    try {
      const eodSymbol = symbol.includes('.') ? symbol : `${symbol}.US`
      const url = `https://eodhd.com/api/eod/${eodSymbol}?api_token=${EODHD}&fmt=json&from=${from}&to=${to}`
      const res  = await fetch(url, { next: { revalidate: 3600 } })
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        return NextResponse.json({
          symbol, from, to, timespan: 'day', multiplier: 1,
          bars: data.map((b: any) => ({
            t: new Date(b.date).getTime(),
            o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume, adj_close: b.adjusted_close,
          })),
          count: data.length,
          source: 'eodhd',
        })
      }
    } catch (e) { console.warn('[aggs] EODHD failed:', (e as Error).message) }
  }

  return NextResponse.json({ error: 'All bar providers exhausted', symbol }, { status: 503 })
}

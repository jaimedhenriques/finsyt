import { NextRequest, NextResponse } from 'next/server'
import { PROVIDERS, massiveFetch, alphaForex } from '@/lib/data-providers'

const EODHD = PROVIDERS.eodhd

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from')?.toUpperCase() || 'EUR'
  const to   = req.nextUrl.searchParams.get('to')?.toUpperCase()   || 'USD'

  // 1. Massive
  if (PROVIDERS.massive) {
    try {
      const data = await massiveFetch(`/v1/last/forex/${from}/${to}`)
      if (data?.last?.exchange) return NextResponse.json({ from, to, rate: data.last.exchange, bid: data.last.bid, ask: data.last.ask, source: 'massive' })
    } catch (e) { console.warn('[forex] Massive failed') }
  }

  // 2. Alpha Vantage (real-time forex)
  if (PROVIDERS.alphav) {
    try {
      const r = await alphaForex(from, to)
      if (r) return NextResponse.json(r)
    } catch (e) { console.warn('[forex] AlphaV failed') }
  }

  // 3. EODHD
  if (EODHD) {
    try {
      const res  = await fetch(`https://eodhd.com/api/real-time/${from}${to}.FOREX?api_token=${EODHD}&fmt=json`, { next: { revalidate: 300 } })
      const data = await res.json()
      if (data?.close) return NextResponse.json({ from, to, rate: data.close, open: data.open, high: data.high, low: data.low, source: 'eodhd' })
    } catch (e) { console.warn('[forex] EODHD failed') }
  }

  return NextResponse.json({ error: 'All forex providers failed', from, to }, { status: 503 })
}

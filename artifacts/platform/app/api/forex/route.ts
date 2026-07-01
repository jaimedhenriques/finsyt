import { NextRequest, NextResponse } from 'next/server'
import { PROVIDERS, massiveFetch, alphaForex } from '@/lib/data-providers'
import { classifySymbol } from '@/lib/asset-class'
import { resolveMultiAssetQuote } from '@/lib/multi-asset'

const EODHD = PROVIDERS.eodhd

// Cap on how many pairs a single batched request may resolve.
const MAX_PAIRS = 16

export async function GET(req: NextRequest) {
  // ── Batch mode: ?pairs=EUR/USD,GBP/USD,… ──────────────────────────────────
  // Returns { rates: [{ pair, from, to, rate, changePct, source }] }. Resolves
  // each pair through the multi-asset FX waterfall (massive → alpha → twelve
  // data → keyless Yahoo) so the markets FX section works without paid keys.
  const pairsParam = req.nextUrl.searchParams.get('pairs')
  if (pairsParam) {
    const pairs = [...new Set(pairsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))].slice(0, MAX_PAIRS)
    if (!pairs.length) return NextResponse.json({ error: 'pairs required' }, { status: 400 })
    const rates = (await Promise.all(pairs.map(async (p) => {
      const c = classifySymbol(p)
      if (c.assetClass !== 'fx' || !c.base || !c.quote) return null
      const q = await resolveMultiAssetQuote(c).catch(() => null)
      if (!q?.price) return null
      return { pair: `${c.base}/${c.quote}`, from: c.base, to: c.quote, rate: q.price, changePct: q.changePct, source: q.source }
    }))).filter((r): r is NonNullable<typeof r> => r !== null)
    return NextResponse.json({ rates, count: rates.length })
  }

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

import { NextRequest, NextResponse } from 'next/server'
import { buildRanking, SIGNALS, UNIVERSES, SignalKey, UniverseKey } from '@/lib/signals'

const VALID_SIGNALS = new Set<string>(SIGNALS.map(s => s.key))
const VALID_UNIVERSES = new Set<string>(UNIVERSES.map(u => u.key))

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const universe = p.get('universe') || 'sp500'
  const signal   = p.get('signal')   || 'sentiment_change'
  if (!VALID_UNIVERSES.has(universe)) {
    return NextResponse.json({ ok: false, reason: 'invalid_param', message: `Unknown universe '${universe}'.` }, { status: 400 })
  }
  if (!VALID_SIGNALS.has(signal)) {
    return NextResponse.json({ ok: false, reason: 'invalid_param', message: `Unknown signal '${signal}'.` }, { status: 400 })
  }
  const result = buildRanking({
    universe: universe as UniverseKey,
    signal:   signal   as SignalKey,
    sector:   p.get('sector')   || 'All',
    country:  p.get('country')  || 'All',
    minCapB:  p.get('minCapB') ? parseFloat(p.get('minCapB')!) : undefined,
    asOfDate: p.get('asOfDate') || p.get('asOf') || undefined,
  })
  return NextResponse.json(result)
}

import { NextRequest, NextResponse } from 'next/server'
import { buildReturns, SIGNALS, UNIVERSES, ReturnCalc, ReturnInterval, SignalKey, UniverseKey } from '@/lib/signals'

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
  const intervalRaw = parseInt(p.get('interval') || '1')
  const interval = ([1,3,6,12].includes(intervalRaw) ? intervalRaw : 1) as ReturnInterval
  const months = Math.max(6, Math.min(60, parseInt(p.get('months') || '24')))
  const calc = (p.get('calc') === 'simple' ? 'simple' : 'compounded') as ReturnCalc
  const result = buildReturns({
    universe: universe as UniverseKey,
    signal:   signal   as SignalKey,
    months,
    interval,
    calc,
  })
  return NextResponse.json(result)
}

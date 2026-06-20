import { NextResponse, type NextRequest } from 'next/server'
import { getShortPositioning } from '@/lib/positioning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Equity short-positioning (Task #410): FINRA daily short-sale volume +
// best-effort SEC fails-to-deliver, both keyless. Usage:
//   /api/short-interest?symbol=NVDA&days=10
// Honest empty states: a symbol with no published short volume returns an
// empty array with source:'none', never a fabricated value.

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const symbol = (sp.get('symbol') || '').trim().toUpperCase()
  const days = Math.min(Math.max(parseInt(sp.get('days') || '10', 10) || 10, 1), 30)

  if (!symbol) {
    return NextResponse.json(
      {
        symbol: '', shortVolume: [], latest: null, avgShortPct: null, ftd: [], latestFtd: null,
        source: 'none', providerError: 'symbol required', fetchedAt: new Date().toISOString(),
      },
      { status: 400 },
    )
  }

  try {
    const result = await getShortPositioning(symbol, days)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[api/short-interest] failed:', message)
    return NextResponse.json({
      symbol, shortVolume: [], latest: null, avgShortPct: null, ftd: [], latestFtd: null,
      source: 'none', providerError: message, fetchedAt: new Date().toISOString(),
    })
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { getCotReport, COT_MARKETS } from '@/lib/positioning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// CFTC Commitment of Traders positioning (Task #410) from the public Socrata
// reporting API. Usage:
//   /api/cot?list=1            → the curated market catalog (no upstream call)
//   /api/cot?market=GOLD       → ~52 weekly reports for a market (code or label)
//   /api/cot?market=088691&weeks=104
// Every response carries a `source` attribution field.

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  if (sp.get('list') === '1') {
    return NextResponse.json({
      markets: COT_MARKETS,
      count: COT_MARKETS.length,
      source: 'CFTC Commitment of Traders',
      fetchedAt: new Date().toISOString(),
    })
  }

  const market = (sp.get('market') || COT_MARKETS[0].code).trim()
  const weeks = Math.min(Math.max(parseInt(sp.get('weeks') || '52', 10) || 52, 1), 260)

  try {
    const result = await getCotReport(market, weeks)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[api/cot] failed:', message)
    return NextResponse.json({
      market: { code: market, label: market, name: null },
      reports: [],
      latest: null,
      count: 0,
      source: 'none',
      providerError: message,
      fetchedAt: new Date().toISOString(),
    })
  }
}

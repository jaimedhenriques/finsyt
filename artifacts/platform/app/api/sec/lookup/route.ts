import { NextResponse, type NextRequest } from 'next/server'
import { secLookup } from '@/lib/positioning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// SEC regulator lookup (Task #410): resolves a ticker, CIK, or company-name
// fragment to canonical CIK ⇆ symbol mappings plus EDGAR deep links, using
// SEC's public company_tickers.json. Usage:
//   /api/sec/lookup?q=NVDA
//   /api/sec/lookup?q=0000320193
//   /api/sec/lookup?q=micro&limit=20

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || sp.get('query') || '').trim()
  const limit = Math.min(Math.max(parseInt(sp.get('limit') || '12', 10) || 12, 1), 50)

  if (!q) {
    return NextResponse.json(
      {
        query: '', entities: [], count: 0, source: 'none',
        providerError: 'query required', fetchedAt: new Date().toISOString(),
      },
      { status: 400 },
    )
  }

  try {
    const result = await secLookup(q, limit)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[api/sec/lookup] failed:', message)
    return NextResponse.json({
      query: q, entities: [], count: 0, source: 'none',
      providerError: message, fetchedAt: new Date().toISOString(),
    })
  }
}

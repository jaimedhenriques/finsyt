import { NextRequest, NextResponse } from 'next/server'
import { worldbankListIndicators, WorldBankApiError, WORLDBANK_FEATURED_INDICATORS } from '@/lib/worldbank-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/worldbank/indicators
 *  ?q=                free-text filter on id / name / source note
 *  ?topic=            World Bank topic id or name fragment, e.g. "1" or "Agriculture"
 *  ?source=           World Bank source id, e.g. "2" (WDI)
 *  ?limit=            max rows (default 100, max 2000)
 *  ?featured=true     return Finsyt's curated featured-indicator list (no upstream call)
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  if (sp.get('featured') === 'true') {
    return NextResponse.json({
      source: 'worldbank',
      featured: WORLDBANK_FEATURED_INDICATORS,
      count: WORLDBANK_FEATURED_INDICATORS.length,
    })
  }
  const limit = Math.min(parseInt(sp.get('limit') || '100', 10), 2000)
  try {
    const rows = await worldbankListIndicators({
      q: sp.get('q') || undefined,
      topic: sp.get('topic') || undefined,
      source: sp.get('source') || undefined,
      limit,
    })
    return NextResponse.json({ source: 'worldbank', indicators: rows, count: rows.length })
  } catch (e) {
    const status = e instanceof WorldBankApiError ? e.httpStatus : 502
    return NextResponse.json({ error: (e as Error).message, source: 'worldbank' }, { status })
  }
}

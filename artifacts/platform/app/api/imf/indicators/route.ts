import { NextRequest, NextResponse } from 'next/server'
import { imfListIndicators, ImfApiError, IMF_FEATURED_INDICATORS } from '@/lib/imf-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/imf/indicators
 *  ?q=                free-text filter on id / label / description
 *  ?dataset=          dataset filter, e.g. "WEO"
 *  ?limit=            max rows (default 100, max 2000)
 *  ?featured=true     return Finsyt's curated featured-indicator list (no upstream call)
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  if (sp.get('featured') === 'true') {
    return NextResponse.json({
      source: 'imf',
      featured: IMF_FEATURED_INDICATORS,
      count: IMF_FEATURED_INDICATORS.length,
    })
  }
  const limit = Math.min(parseInt(sp.get('limit') || '100', 10), 2000)
  try {
    const rows = await imfListIndicators({
      q: sp.get('q') || undefined,
      dataset: sp.get('dataset') || undefined,
      limit,
    })
    return NextResponse.json({ source: 'imf', indicators: rows, count: rows.length })
  } catch (e) {
    const status = e instanceof ImfApiError ? e.httpStatus : 502
    return NextResponse.json({ error: (e as Error).message, source: 'imf' }, { status })
  }
}

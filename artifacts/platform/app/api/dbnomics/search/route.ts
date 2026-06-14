import { NextRequest, NextResponse } from 'next/server'
import { dbnomicsSearch, DbnomicsApiError } from '@/lib/dbnomics-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/dbnomics/search
 *  ?q=        (required) free-text query across the DBnomics catalog
 *  ?limit=    max dataset hits (default 20, max 100)
 *
 * Returns dataset-level hits; drill into a dataset to pick a concrete
 * provider/dataset/series id for /api/dbnomics/series.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = sp.get('q') || ''
  if (!q.trim()) {
    return NextResponse.json({
      error: 'missing required param: q',
      example: '/api/dbnomics/search?q=inflation',
    }, { status: 400 })
  }
  const limit = sp.get('limit') ? Number(sp.get('limit')) : undefined
  try {
    const results = await dbnomicsSearch({ q, limit })
    return NextResponse.json({ source: 'dbnomics', results, count: results.length })
  } catch (e) {
    const status = e instanceof DbnomicsApiError ? e.httpStatus : 502
    return NextResponse.json({ error: (e as Error).message, source: 'dbnomics' }, { status })
  }
}

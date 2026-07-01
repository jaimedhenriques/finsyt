import { NextRequest, NextResponse } from 'next/server'
import { censusListDatasets, CensusApiError } from '@/lib/census-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/census/datasets
 *  ?q=acs              fuzzy filter on title/description
 *  ?vintage=2022       restrict by year
 *  ?limit=50           cap rows (default 100)
 *
 * Returns the official Census dataset catalog (full list cached 6h).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = sp.get('q') || undefined
  const vintageStr = sp.get('vintage')
  const vintage = vintageStr ? Number(vintageStr) : undefined
  const limit = Math.min(Number(sp.get('limit') || '100'), 500)

  try {
    const rows = await censusListDatasets({ q, vintage, limit })
    return NextResponse.json({
      source: 'census',
      count: rows.length,
      datasets: rows.map(d => ({
        title: d.title,
        description: d.description,
        identifier: d.identifier,
        dataset: d.c_dataset,
        vintage: d.c_vintage,
        accessUrl: d.distribution?.[0]?.accessURL,
      })),
    })
  } catch (e) {
    const status = e instanceof CensusApiError ? e.httpStatus : 502
    return NextResponse.json({ error: (e as Error).message, source: 'census' }, { status })
  }
}

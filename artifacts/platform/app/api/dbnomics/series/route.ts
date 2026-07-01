import { NextRequest, NextResponse } from 'next/server'
import { dbnomicsFetchSeries, DbnomicsApiError, DBNOMICS_FEATURED_SERIES } from '@/lib/dbnomics-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/dbnomics/series
 *  ?id=provider/dataset/series   (preferred) full DBnomics series id
 *  ?provider=&dataset=&series=    parts (alternative to id)
 *  ?featured=true                 return Finsyt's curated example series ids (no upstream call)
 *
 * Examples:
 *   /api/dbnomics/series?id=IMF/WEO:latest/USA.NGDP_RPCH
 *   /api/dbnomics/series?provider=Eurostat&dataset=une_rt_m&series=M.SA.TOTAL.PC_ACT.T.EA20
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  if (sp.get('featured') === 'true') {
    return NextResponse.json({
      source: 'dbnomics',
      featured: DBNOMICS_FEATURED_SERIES,
      count: DBNOMICS_FEATURED_SERIES.length,
    })
  }
  const id = sp.get('id') || ''
  const provider = sp.get('provider') || ''
  const dataset = sp.get('dataset') || ''
  const series = sp.get('series') || ''
  if (!id && !(provider && dataset && series)) {
    return NextResponse.json({
      error: 'provide ?id=provider/dataset/series or ?provider=&dataset=&series=',
      example: '/api/dbnomics/series?id=IMF/WEO:latest/USA.NGDP_RPCH',
    }, { status: 400 })
  }
  try {
    const data = await dbnomicsFetchSeries({
      seriesId: id || undefined,
      provider: provider || undefined,
      dataset: dataset || undefined,
      series: series || undefined,
    })
    return NextResponse.json(data)
  } catch (e) {
    const status = e instanceof DbnomicsApiError ? e.httpStatus : 502
    return NextResponse.json({ error: (e as Error).message, source: 'dbnomics' }, { status })
  }
}

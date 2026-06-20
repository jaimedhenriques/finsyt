import { NextRequest, NextResponse } from 'next/server'
import { imfFetchSeries, ImfApiError } from '@/lib/imf-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/imf/data
 *  ?indicator=NGDP_RPCH   (required) IMF DataMapper indicator code
 *  ?country=USA           ISO3 code, or comma/semicolon list (USA,CHN,DEU); omit for all
 *
 * Examples:
 *   /api/imf/data?indicator=NGDP_RPCH&country=USA
 *   /api/imf/data?indicator=GGXWDG_NGDP&country=USA,CHN,JPN
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const indicator = sp.get('indicator') || ''
  if (!indicator) {
    return NextResponse.json({
      error: 'missing required param: indicator',
      example: '/api/imf/data?indicator=NGDP_RPCH&country=USA',
    }, { status: 400 })
  }
  try {
    const data = await imfFetchSeries({
      indicator,
      countries: sp.get('country') || undefined,
    })
    return NextResponse.json(data)
  } catch (e) {
    const status = e instanceof ImfApiError ? e.httpStatus : 502
    return NextResponse.json({ error: (e as Error).message, source: 'imf' }, { status })
  }
}

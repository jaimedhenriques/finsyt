import { NextRequest, NextResponse } from 'next/server'
import { worldbankFetchSeries, WorldBankApiError } from '@/lib/worldbank-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/worldbank/data
 *  ?indicator=NY.GDP.MKTP.CD   (required) World Bank indicator id
 *  ?country=US                 ISO2/ISO3 code, "all" / "WLD", or semicolon-list (USA;CHN;DEU)
 *  ?startYear=2000
 *  ?endYear=2024
 *
 * Examples:
 *   /api/worldbank/data?indicator=NY.GDP.MKTP.CD&country=US&startYear=2000
 *   /api/worldbank/data?indicator=SP.POP.TOTL&country=USA;CHN;IND&startYear=1960
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const indicator = sp.get('indicator') || ''
  if (!indicator) {
    return NextResponse.json({
      error: 'missing required param: indicator',
      example: '/api/worldbank/data?indicator=NY.GDP.MKTP.CD&country=US',
    }, { status: 400 })
  }
  const startYear = sp.get('startYear') ? Number(sp.get('startYear')) : undefined
  const endYear = sp.get('endYear') ? Number(sp.get('endYear')) : undefined
  try {
    const data = await worldbankFetchSeries({
      indicator,
      country: sp.get('country') || undefined,
      startYear,
      endYear,
    })
    return NextResponse.json(data)
  } catch (e) {
    const status = e instanceof WorldBankApiError ? e.httpStatus : 502
    return NextResponse.json({ error: (e as Error).message, source: 'worldbank' }, { status })
  }
}

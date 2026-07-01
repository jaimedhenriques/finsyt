import { NextRequest, NextResponse } from 'next/server'
import { censusResolveFips, CensusApiError } from '@/lib/census-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/census/geocode
 *  ?address=1600 Pennsylvania Ave NW, Washington DC
 *
 * Resolves a one-line address (or place name) to FIPS codes for state, county,
 * tract, block, place, and CBSA via the Census Geocoder. Useful for converting
 * "Travis County, TX" → state=48 & county=453 before calling /api/census/aggregate.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address') || ''
  if (!address.trim()) {
    return NextResponse.json({
      error: 'missing required param: address',
      example: '/api/census/geocode?address=1600 Pennsylvania Ave NW, Washington DC',
    }, { status: 400 })
  }

  try {
    const result = await censusResolveFips(address)
    return NextResponse.json({ source: 'census', ...result })
  } catch (e) {
    const status = e instanceof CensusApiError ? e.httpStatus : 502
    return NextResponse.json({ error: (e as Error).message, source: 'census' }, { status })
  }
}

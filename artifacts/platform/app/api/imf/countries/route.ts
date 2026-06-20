import { NextRequest, NextResponse } from 'next/server'
import { imfListCountries, ImfApiError } from '@/lib/imf-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/imf/countries
 *  ?q=        free-text filter on ISO3 code / name
 *  ?limit=    max rows (default 500)
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const limit = Math.min(parseInt(sp.get('limit') || '500', 10), 2000)
  try {
    const rows = await imfListCountries({ q: sp.get('q') || undefined, limit })
    return NextResponse.json({ source: 'imf', countries: rows, count: rows.length })
  } catch (e) {
    const status = e instanceof ImfApiError ? e.httpStatus : 502
    return NextResponse.json({ error: (e as Error).message, source: 'imf' }, { status })
  }
}

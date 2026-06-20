import { NextRequest, NextResponse } from 'next/server'
import { worldbankListCountries, WorldBankApiError } from '@/lib/worldbank-provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/worldbank/countries
 *  ?q=                free-text filter on name / iso codes / capital
 *  ?region=           region id or name fragment, e.g. "EAS" or "East Asia"
 *  ?incomeLevel=      income level id, e.g. "HIC", "LIC", "UMC"
 *  ?limit=            max rows (default 500)
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const limit = Math.min(parseInt(sp.get('limit') || '500', 10), 1000)
  try {
    const rows = await worldbankListCountries({
      q: sp.get('q') || undefined,
      region: sp.get('region') || undefined,
      incomeLevel: sp.get('incomeLevel') || undefined,
      limit,
    })
    return NextResponse.json({ source: 'worldbank', countries: rows, count: rows.length })
  } catch (e) {
    const status = e instanceof WorldBankApiError ? e.httpStatus : 502
    return NextResponse.json({ error: (e as Error).message, source: 'worldbank' }, { status })
  }
}

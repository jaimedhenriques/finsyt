import { NextRequest, NextResponse } from 'next/server'
import { yahooEsg } from '@/lib/data-providers'

export const dynamic = 'force-dynamic'

const SYMBOL_RE = /^[A-Za-z0-9.\-]{1,15}$/

// GET /api/esg?symbol=AAPL
//
// Numeric ESG / sustainability scores (total + E/S/G sub-scores, percentile,
// controversy level) sourced from Yahoo's keyless quoteSummary `esgScores`
// module. This domain is not covered by our primary FMP/EODHD plans, so it is
// purely additive. Always tagged `source: 'yahoo'`; degrades to an empty
// payload with a note when Yahoo is unreachable or the issuer has no rating.
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  if (!symbol || !SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ error: 'valid symbol required' }, { status: 400 })
  }
  try {
    const esg = await yahooEsg(symbol)
    if (!esg) {
      return NextResponse.json({
        symbol, esg: null, source: 'none',
        note: 'No ESG / sustainability rating available for this issuer from Yahoo.',
      })
    }
    return NextResponse.json({ symbol, esg, source: 'yahoo' })
  } catch (e) {
    return NextResponse.json({
      symbol, esg: null, source: 'error',
      note: `Unable to load ESG data: ${(e as Error).message}`,
    })
  }
}

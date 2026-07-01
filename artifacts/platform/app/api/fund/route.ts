import { NextRequest, NextResponse } from 'next/server'
import { yahooFundProfile } from '@/lib/data-providers'

export const dynamic = 'force-dynamic'

const SYMBOL_RE = /^[A-Za-z0-9.\-]{1,15}$/

// GET /api/fund?symbol=SPY
//
// Fund / ETF profile + top holdings + sector & asset-class weightings + bond
// ratings, sourced from Yahoo's keyless quoteSummary modules (topHoldings,
// fundProfile, defaultKeyStatistics, assetProfile, quoteType). This entire
// domain is MISSING from Finsyt today, so it is purely additive. Returns
// `source: 'yahoo'`; degrades to an empty payload + note when the symbol is
// not a fund/ETF or Yahoo is unreachable.
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  if (!symbol || !SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ error: 'valid symbol required' }, { status: 400 })
  }
  try {
    const fund = await yahooFundProfile(symbol)
    if (!fund) {
      return NextResponse.json({
        symbol, fund: null, source: 'none',
        note: 'No fund/ETF profile available for this symbol (not a fund, or Yahoo unreachable).',
      })
    }
    return NextResponse.json({ symbol, fund, source: 'yahoo' })
  } catch (e) {
    return NextResponse.json({
      symbol, fund: null, source: 'error',
      note: `Unable to load fund/ETF data: ${(e as Error).message}`,
    })
  }
}

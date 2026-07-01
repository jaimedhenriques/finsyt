import { NextRequest, NextResponse } from 'next/server'
import { yahooUpgradeHistory } from '@/lib/data-providers'

export const dynamic = 'force-dynamic'

const SYMBOL_RE = /^[A-Za-z0-9.\-]{1,15}$/

// GET /api/upgrades?symbol=AAPL&limit=40
//
// Per-firm upgrade / downgrade *history* (firm, from-grade, to-grade, action,
// date) from Yahoo's keyless quoteSummary `upgradeDowngradeHistory` module.
// FMP only returns a consensus snapshot, so the chronological per-firm action
// log is additive. Tagged `source: 'yahoo'`; degrades to empty + note.
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '40', 10) || 40, 1), 100)
  if (!symbol || !SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ error: 'valid symbol required' }, { status: 400 })
  }
  try {
    const data = await yahooUpgradeHistory(symbol, limit)
    if (!data) {
      return NextResponse.json({
        symbol, history: [], source: 'none',
        note: 'No upgrade/downgrade history available for this symbol from Yahoo.',
      })
    }
    return NextResponse.json({ symbol, history: data.history, source: 'yahoo' })
  } catch (e) {
    return NextResponse.json({
      symbol, history: [], source: 'error',
      note: `Unable to load upgrade/downgrade history: ${(e as Error).message}`,
    })
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { getPredictionMarkets, type PredictionSource } from '@/lib/prediction-markets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Read-only prediction-market odds (Task #395) from Polymarket (public Gamma
// API) and Kalshi (public market-data API). Usage:
//   /api/prediction-markets                         → most-active markets
//   /api/prediction-markets?q=election              → keyword search
//   /api/prediction-markets?symbol=NVDA&name=NVIDIA → company-relevant markets
//   /api/prediction-markets?source=polymarket       → single venue
//   /api/prediction-markets?category=politics        → category contains-filter
// Every response carries a `source` attribution field.

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || '').trim()
  const symbol = (sp.get('symbol') || '').trim().toUpperCase()
  const name = (sp.get('name') || '').trim()
  const category = (sp.get('category') || '').trim()
  const limit = Math.min(Math.max(parseInt(sp.get('limit') || '30', 10) || 30, 1), 100)

  const rawSource = (sp.get('source') || 'both').toLowerCase()
  const source: PredictionSource =
    rawSource === 'polymarket' || rawSource === 'kalshi' ? rawSource : 'both'

  try {
    const result = await getPredictionMarkets({ q, symbol, name, category, source, limit })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[api/prediction-markets] failed:', message)
    return NextResponse.json({
      markets: [],
      source: 'none',
      count: 0,
      providers: { polymarket: 'error', kalshi: 'error' },
      providerError: message,
      fetchedAt: new Date().toISOString(),
    })
  }
}

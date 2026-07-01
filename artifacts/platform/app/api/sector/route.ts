import { NextRequest, NextResponse } from 'next/server'
import { yahooFundProfile } from '@/lib/data-providers'

export const dynamic = 'force-dynamic'

// SPDR Select-Sector ETFs are the canonical, liquid proxies for each GICS
// sector. We use their Yahoo top-holdings + sector weightings as a keyless
// "sector aggregate" — i.e. the largest constituents and intra-sector mix of
// each sector — which Finsyt does not surface today.
const SECTOR_ETFS: Record<string, { etf: string; label: string }> = {
  technology:             { etf: 'XLK', label: 'Information Technology' },
  'information-technology':{ etf: 'XLK', label: 'Information Technology' },
  financials:             { etf: 'XLF', label: 'Financials' },
  'financial-services':   { etf: 'XLF', label: 'Financials' },
  healthcare:             { etf: 'XLV', label: 'Health Care' },
  'health-care':          { etf: 'XLV', label: 'Health Care' },
  energy:                 { etf: 'XLE', label: 'Energy' },
  industrials:            { etf: 'XLI', label: 'Industrials' },
  'consumer-discretionary':{ etf: 'XLY', label: 'Consumer Discretionary' },
  'consumer-cyclical':    { etf: 'XLY', label: 'Consumer Discretionary' },
  'consumer-staples':     { etf: 'XLP', label: 'Consumer Staples' },
  'consumer-defensive':   { etf: 'XLP', label: 'Consumer Staples' },
  utilities:              { etf: 'XLU', label: 'Utilities' },
  materials:              { etf: 'XLB', label: 'Materials' },
  'basic-materials':      { etf: 'XLB', label: 'Materials' },
  'real-estate':          { etf: 'XLRE', label: 'Real Estate' },
  realestate:             { etf: 'XLRE', label: 'Real Estate' },
  'communication-services':{ etf: 'XLC', label: 'Communication Services' },
  communications:         { etf: 'XLC', label: 'Communication Services' },
}

function normSector(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/&/g, '').replace(/--+/g, '-')
}

// GET /api/sector            → list of available sectors
// GET /api/sector?sector=technology  → aggregate (top holdings + weightings)
//
// Sector aggregate built from the SPDR Select-Sector ETF via Yahoo's keyless
// fund profile. Tagged `source: 'yahoo'`; degrades gracefully.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('sector')
  if (!raw) {
    return NextResponse.json({
      sectors: Object.values(
        Object.fromEntries(Object.entries(SECTOR_ETFS).map(([, v]) => [v.etf, v])),
      ),
      note: 'Pass ?sector=<name> (e.g. technology, financials, energy) for an aggregate.',
    })
  }
  const key = normSector(raw)
  const match = SECTOR_ETFS[key]
  if (!match) {
    return NextResponse.json({
      sector: raw, fund: null, source: 'none',
      note: `Unknown sector "${raw}". Known: ${[...new Set(Object.values(SECTOR_ETFS).map(v => v.label))].join(', ')}.`,
    })
  }
  try {
    const fund = await yahooFundProfile(match.etf)
    if (!fund) {
      return NextResponse.json({
        sector: match.label, etf: match.etf, fund: null, source: 'none',
        note: 'Sector aggregate unavailable (Yahoo unreachable).',
      })
    }
    return NextResponse.json({ sector: match.label, etf: match.etf, fund, source: 'yahoo' })
  } catch (e) {
    return NextResponse.json({
      sector: match.label, etf: match.etf, fund: null, source: 'error',
      note: `Unable to load sector aggregate: ${(e as Error).message}`,
    })
  }
}

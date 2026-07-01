import { NextRequest, NextResponse } from 'next/server'
import {
  INTL_COVERAGE_DB,
  intlMeta,
  coverageLevel,
  countryFromSymbol,
  type CoverageLevel,
} from '@/lib/intl-fiscal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/intl/coverage
 *
 * Returns coverage metadata for international (non-US) companies.
 *
 * Query params:
 *   ?symbol=7203.T          — single symbol lookup
 *   ?symbols=7203.T,ASML.AS — batch lookup (max 50)
 *   ?list=true              — return the full seed basket
 *   ?country=JP             — filter seed basket by country
 *   ?coverage=full          — filter seed basket by coverage level
 *
 * Response shape (single):
 *   { symbol, name?, exchange?, country, currency?, fyEndMonth?, coverage, inBasket }
 *
 * Response shape (list/batch):
 *   { items: [...], count }
 */

function formatItem(meta: ReturnType<typeof intlMeta>, symbol: string) {
  if (meta) {
    return {
      symbol: meta.symbol,
      name: meta.name,
      exchange: meta.exchange,
      country: meta.country,
      currency: meta.currency,
      fyEndMonth: meta.fyEndMonth,
      coverage: meta.coverage,
      inBasket: true,
    }
  }
  // Symbol not in the seed basket — infer what we can from the suffix.
  const inferredCountry = countryFromSymbol(symbol)
  const level: CoverageLevel = inferredCountry === 'US' ? 'none' : 'none'
  return {
    symbol: symbol.toUpperCase(),
    name: null,
    exchange: null,
    country: inferredCountry,
    currency: null,
    fyEndMonth: null,
    coverage: level,
    inBasket: false,
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  // ── Full basket list ──────────────────────────────────────────────────────
  if (sp.get('list') === 'true') {
    let items = [...INTL_COVERAGE_DB]

    const countryFilter   = sp.get('country')?.toUpperCase()
    const coverageFilter  = sp.get('coverage') as CoverageLevel | null

    if (countryFilter)  items = items.filter(i => i.country === countryFilter)
    if (coverageFilter) items = items.filter(i => i.coverage === coverageFilter)

    const formatted = items.map(i => ({
      symbol:     i.symbol,
      name:       i.name,
      exchange:   i.exchange,
      country:    i.country,
      currency:   i.currency,
      fyEndMonth: i.fyEndMonth,
      coverage:   i.coverage,
      inBasket:   true,
    }))

    return NextResponse.json({ items: formatted, count: formatted.length })
  }

  // ── Batch symbols ─────────────────────────────────────────────────────────
  const symbolsParam = sp.get('symbols')
  if (symbolsParam) {
    const symbols = symbolsParam
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 50)

    const items = symbols.map(sym => formatItem(intlMeta(sym), sym))
    return NextResponse.json({ items, count: items.length })
  }

  // ── Single symbol ─────────────────────────────────────────────────────────
  const symbol = sp.get('symbol')?.trim().toUpperCase()
  if (symbol) {
    const meta = intlMeta(symbol)
    return NextResponse.json(formatItem(meta, symbol))
  }

  // ── Summary stats (no params) ─────────────────────────────────────────────
  const byLevel: Record<CoverageLevel, number> = { full: 0, partial: 0, none: 0 }
  for (const item of INTL_COVERAGE_DB) byLevel[item.coverage]++

  const byCountry: Record<string, number> = {}
  for (const item of INTL_COVERAGE_DB) {
    byCountry[item.country] = (byCountry[item.country] ?? 0) + 1
  }

  return NextResponse.json({
    totalInBasket: INTL_COVERAGE_DB.length,
    byLevel,
    byCountry,
    coverageLevels: {
      full:    'Real data confirmed via provider waterfall for quotes, financials, and earnings.',
      partial: 'Quote and headline financials available; quarterly detail or estimates may be EODHD-only.',
      none:    'Not in the verified seed basket. Data may still be available but has not been validated.',
    },
  })
}

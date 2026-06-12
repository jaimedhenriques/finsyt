import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { eq } from 'drizzle-orm'
import { withOrgContext, portfolioPositionsTable } from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'
import {
  computeRiskMetrics,
  alignedReturnsMatrix,
  riskContributions,
  priceReturns,
} from '@/lib/portfolio-analytics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Bar { t: number; c: number }

async function fetchBars(origin: string, symbol: string, from: string, to: string): Promise<Array<{ date: string; close: number }>> {
  const u = `${origin}/api/aggs?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&timespan=day&multiplier=1`
  try {
    const r = await fetch(u, { cache: 'no-store' })
    if (!r.ok) return []
    const j = await r.json() as { results?: Bar[]; bars?: Bar[] }
    const bars = (j.results || j.bars || []) as Bar[]
    return bars
      .filter(b => Number.isFinite(b.t) && Number.isFinite(b.c) && b.c > 0)
      .map(b => ({ date: new Date(b.t).toISOString().slice(0, 10), close: Number(b.c) }))
  } catch {
    return []
  }
}

/**
 * GET /api/portfolio/analytics
 *  ?benchmark=SPY            (default SPY) ETF / index symbol to benchmark against
 *  ?days=252                 (default 252 ≈ 1y trading days) lookback window
 *  ?riskFreeRate=0.04        (decimal) used for Sharpe / Sortino
 *
 * Response:
 *  - riskMetrics: { sharpe, sortino, maxDrawdown, var95, beta, alpha, ... }
 *  - contributions: per-position weight + risk contribution
 *  - benchmark, lookbackDays, positions
 */
export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const sp = req.nextUrl.searchParams
  const benchmark = (sp.get('benchmark') || 'SPY').toUpperCase()
  const days = Math.min(Math.max(parseInt(sp.get('days') || '252', 10), 30), 1260)
  const riskFreeRate = Number(sp.get('riskFreeRate') || '0.04')

  const localOrgId = await resolveLocalOrgId(orgId)
  const positions = await withOrgContext(localOrgId, (tx) =>
    tx.select()
      .from(portfolioPositionsTable)
      .where(eq(portfolioPositionsTable.orgId, localOrgId))
      .limit(500),
  )
  if (!positions.length) {
    return NextResponse.json({
      benchmark,
      lookbackDays: days,
      positions: 0,
      riskMetrics: null,
      contributions: [],
      message: 'no positions in this workspace',
    })
  }

  const today = new Date()
  const start = new Date(today.getTime() - (days + 30) * 24 * 60 * 60 * 1000)
  const fromStr = start.toISOString().slice(0, 10)
  const toStr = today.toISOString().slice(0, 10)

  const symbols = Array.from(new Set(positions.map(p => p.symbol.toUpperCase())))
  const origin = `${req.nextUrl.protocol}//${req.nextUrl.host}`
  const series = await Promise.all(symbols.map(async s => [s, await fetchBars(origin, s, fromStr, toStr)] as const))
  const bench = await fetchBars(origin, benchmark, fromStr, toStr)

  const seriesMap: Record<string, Array<{ date: string; close: number }>> = {}
  for (const [s, arr] of series) if (arr.length >= 30) seriesMap[s] = arr
  if (Object.keys(seriesMap).length === 0) {
    return NextResponse.json({
      benchmark,
      lookbackDays: days,
      positions: positions.length,
      riskMetrics: null,
      contributions: [],
      error: 'insufficient price history for any position',
    }, { status: 502 })
  }

  // Compute weights using latest close × shares.
  const latestClose: Record<string, number> = {}
  for (const [s, arr] of Object.entries(seriesMap)) latestClose[s] = arr[arr.length - 1].close
  const positionMv: Array<{ symbol: string; mv: number }> = []
  for (const p of positions) {
    const last = latestClose[p.symbol.toUpperCase()]
    if (!last) continue
    positionMv.push({ symbol: p.symbol.toUpperCase(), mv: Number(p.shares) * last })
  }
  const totalMv = positionMv.reduce((s, p) => s + p.mv, 0)
  const weightBySymbol: Record<string, number> = {}
  for (const p of positionMv) weightBySymbol[p.symbol] = totalMv > 0 ? p.mv / totalMv : 0

  const { matrix, symbols: alignedSymbols, dates: returnDates } = alignedReturnsMatrix(seriesMap)
  if (!matrix.length) {
    return NextResponse.json({
      benchmark,
      lookbackDays: days,
      positions: positions.length,
      riskMetrics: null,
      contributions: [],
      error: 'no overlapping price history across positions',
    }, { status: 502 })
  }

  // Portfolio returns = Σ wᵢ rᵢ for each period.
  const weights = alignedSymbols.map(s => weightBySymbol[s] ?? 0)
  const wSum = weights.reduce((s, w) => s + w, 0)
  const normalizedW = wSum > 0 ? weights.map(w => w / wSum) : weights
  const portfolioReturns = matrix.map(row => row.reduce((s, r, i) => s + r * normalizedW[i], 0))

  // Build benchmark returns aligned 1:1 with portfolio returns. `returnDates[t]`
  // is the date of return t (i.e. the close on returnDates[t] divided by the
  // prior period's close). For each return date we need:
  //   - benchClose on returnDates[t-1] AND on returnDates[t]
  // We walk the portfolio's return-date list (NOT the benchmark's own dates)
  // so the two arrays stay perfectly index-aligned.
  const benchByDate = new Map(bench.map(b => [b.date, b.close]))
  const benchmarkReturns: number[] = []
  const alignedPortReturns: number[] = []
  // We need a benchmark close for the period BEFORE returnDates[0]. The
  // alignedReturnsMatrix builds returns from sequential closes in seriesMap
  // (the longest common-date close-price series); for portfolio return at
  // index t the underlying date pair is (commonDates[t], commonDates[t+1])
  // which were sliced into returnDates starting at t+1. Therefore the
  // benchmark needs a close for the date immediately preceding returnDates[0]
  // — which we approximate by walking returnDates pairwise: a benchmark
  // return at portfolio index t is approximately benchClose[t]/benchClose[t-1]
  // where both timestamps come from returnDates.
  for (let t = 1; t < returnDates.length; t++) {
    const prevDate = returnDates[t - 1]
    const curDate = returnDates[t]
    const bPrev = benchByDate.get(prevDate)
    const bCur = benchByDate.get(curDate)
    if (bPrev == null || bCur == null || bPrev <= 0) continue
    benchmarkReturns.push(bCur / bPrev - 1)
    alignedPortReturns.push(portfolioReturns[t])
  }

  // Use the aligned arrays for regression-derived metrics; if alignment was
  // not possible (no benchmark coverage), fall back to portfolio-only metrics.
  const useAligned = alignedPortReturns.length === benchmarkReturns.length && benchmarkReturns.length >= 2
  const riskMetrics = computeRiskMetrics(useAligned ? alignedPortReturns : portfolioReturns, {
    riskFreeRate,
    benchmarkReturns: useAligned ? benchmarkReturns : undefined,
  })

  const contribs = riskContributions(normalizedW, matrix)
  const contribsWithSymbols = contribs.map((c, i) => ({ ...c, symbol: alignedSymbols[i] }))

  // Also surface a benchmark vol/return for context.
  const benchAnn = benchmarkReturns.length
    ? {
        annualReturn: (benchmarkReturns.reduce((s, x) => s + x, 0) / benchmarkReturns.length) * 252,
        annualVol: Math.sqrt(benchmarkReturns.reduce((s, x) => {
          const m = benchmarkReturns.reduce((a, b) => a + b, 0) / benchmarkReturns.length
          return s + (x - m) ** 2
        }, 0) / Math.max(1, benchmarkReturns.length - 1)) * Math.sqrt(252),
      }
    : null

  return NextResponse.json({
    benchmark,
    lookbackDays: returnDates.length,
    benchmarkAlignedDays: alignedPortReturns.length,
    positions: positions.length,
    totalMarketValue: totalMv,
    weights: Object.fromEntries(alignedSymbols.map((s, i) => [s, normalizedW[i]])),
    riskMetrics,
    contributions: contribsWithSymbols.sort((a, b) => Math.abs(b.riskContribution) - Math.abs(a.riskContribution)),
    benchmarkStats: benchAnn,
  })
}

// Re-export for downstream linting cleanliness
export { priceReturns }

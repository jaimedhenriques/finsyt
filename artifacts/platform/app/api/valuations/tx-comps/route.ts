import { NextResponse, type NextRequest } from 'next/server'
import { fmpFetch } from '@/lib/data-providers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Transaction Comps endpoint for the Football Field valuation chart.
 *
 * Algorithm:
 *  1. Fetch subject's latest annual income statement + balance sheet (FMP).
 *  2. Fetch recent M&A deals from FMP (latest + search by subject symbol).
 *  3. For each deal with a targetSymbol, batch-fetch the target's annual
 *     income statement (the period closest to the deal date).
 *  4. For each deal where target financials are available, compute:
 *       • EV/Revenue   = dealEV / targetRevenue
 *       • EV/EBITDA    = dealEV / targetEBITDA
 *       • EV/EBIT      = dealEV / targetEBIT (operatingIncome)
 *       • Equity/NI    = dealEV / targetNetIncome  (deal value as equity proxy)
 *  5. Return Q1/median/Q3 of each set, translated to an implied price for
 *     the subject via: implied_price = (multiple × subject_metric) − net_debt/share
 *     (for EV multiples) or multiple × eps (for equity multiple).
 *
 * The `source` field is always returned so the UI can surface attribution.
 */

function n(v: unknown): number | null {
  if (v == null) return null
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : null
}

function quartile(xs: number[], q: number): number | null {
  const sorted = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const idx = (sorted.length - 1) * q
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

interface IncomeRow {
  revenue?: number | null
  ebitda?: number | null
  operatingIncome?: number | null
  netIncome?: number | null
  weightedAverageShsOutDil?: number | null
  date?: string | null
  calendarYear?: string | null
}

interface BalanceRow {
  totalDebt?: number | null
  cashAndCashEquivalents?: number | null
  shortTermInvestments?: number | null
  netDebt?: number | null
  date?: string | null
}

interface MaRow {
  symbol?: string
  companyName?: string
  targetedSymbol?: string
  targetedCompanyName?: string
  totalDealValue?: number | string | null
  transactionDate?: string | null
  acceptedDate?: string | null
  filingDate?: string | null
  acceptanceTime?: string | null
  status?: string
  description?: string
}

interface CompResult {
  targetSymbol: string
  targetName: string
  dealEV: number
  dealDate: string | null
  evRevenue: number | null
  evEbitda: number | null
  evEbit: number | null
  equityNI: number | null
}

function pickDate(row: MaRow): string | null {
  return row.acceptedDate || row.transactionDate || row.filingDate || row.acceptanceTime || null
}

async function fetchIncomeStatement(symbol: string, date: string | null): Promise<IncomeRow | null> {
  try {
    const data = await fmpFetch('/stable/income-statement', {
      symbol,
      period: 'annual',
      limit: '3',
    })
    if (!Array.isArray(data) || data.length === 0) return null
    if (!date) return data[0] as IncomeRow
    const yr = date.slice(0, 4)
    const match = (data as IncomeRow[]).find(r => r.date?.startsWith(yr) || r.calendarYear === yr)
    return match ?? (data[0] as IncomeRow)
  } catch {
    return null
  }
}

async function fetchBalanceSheet(symbol: string): Promise<BalanceRow | null> {
  try {
    const data = await fmpFetch('/stable/balance-sheet-statement', {
      symbol,
      period: 'annual',
      limit: '1',
    })
    if (!Array.isArray(data) || data.length === 0) return null
    return data[0] as BalanceRow
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const symbol = (sp.get('symbol') || '').trim().toUpperCase()

  if (!symbol) {
    return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  }

  // ── 1. Subject financials ────────────────────────────────────────────────
  const [subjectIncome, subjectBalance, subjectProfile] = await Promise.all([
    fetchIncomeStatement(symbol, null),
    fetchBalanceSheet(symbol),
    fmpFetch('/stable/profile', { symbol }).catch(() => null),
  ])

  const subjectRevenue  = n(subjectIncome?.revenue)
  const subjectEbitda   = n(subjectIncome?.ebitda)
  const subjectEbit     = n(subjectIncome?.operatingIncome)
  const subjectNetIncome = n(subjectIncome?.netIncome)
  const subjectShares   = n(subjectIncome?.weightedAverageShsOutDil)

  // Net debt for equity bridge: prefer explicit netDebt field, then compute
  const rawNetDebt = n(subjectBalance?.netDebt)
  const subjectNetDebt = rawNetDebt != null
    ? rawNetDebt
    : (() => {
        const debt = n(subjectBalance?.totalDebt) ?? 0
        const cash = (n(subjectBalance?.cashAndCashEquivalents) ?? 0) + (n(subjectBalance?.shortTermInvestments) ?? 0)
        return debt - cash
      })()

  const subjectEps = (subjectNetIncome != null && subjectShares != null && subjectShares > 0)
    ? subjectNetIncome / subjectShares
    : null

  const netDebtPerShare = (subjectShares != null && subjectShares > 0)
    ? subjectNetDebt / subjectShares
    : null

  const industry: string = (() => {
    const prof = Array.isArray(subjectProfile) ? subjectProfile[0] : subjectProfile
    return (prof as any)?.industry ?? (prof as any)?.sector ?? ''
  })()

  // ── 2. M&A deal feed ─────────────────────────────────────────────────────
  // Merge latest deals + deals where this ticker was the acquirer/target.
  // De-duplicate by targetSymbol so we don't overcount a target with two filings.
  const [latestDeals, searchDeals] = await Promise.all([
    fmpFetch('/stable/mergers-acquisitions-latest', { page: '0', limit: '80' }).catch(() => null),
    fmpFetch('/stable/mergers-acquisitions-search', { symbol, limit: '30' }).catch(() => null),
  ])

  const allDeals: MaRow[] = [
    ...(Array.isArray(latestDeals) ? latestDeals : []),
    ...(Array.isArray(searchDeals) ? searchDeals : []),
  ]

  // Collect candidate targets — only those with a targetedSymbol and a deal value.
  // Exclude the subject itself as a target (it's the company we're valuing).
  const seenTargets = new Set<string>()
  const candidates: Array<{ row: MaRow; dealEV: number; targetSymbol: string }> = []
  for (const row of allDeals) {
    const ts = (row.targetedSymbol || '').toUpperCase()
    if (!ts || ts === symbol) continue
    const ev = n(row.totalDealValue)
    if (!ev || ev <= 0) continue
    if (seenTargets.has(ts)) continue
    seenTargets.add(ts)
    candidates.push({ row, dealEV: ev, targetSymbol: ts })
  }

  // Cap at 15 targets to avoid runaway upstream calls
  const topCandidates = candidates.slice(0, 15)

  // ── 3. Fetch target financials in parallel ────────────────────────────────
  const targetFinancials = await Promise.all(
    topCandidates.map(({ row, targetSymbol }) =>
      fetchIncomeStatement(targetSymbol, pickDate(row)),
    ),
  )

  // ── 4. Compute per-deal multiples ─────────────────────────────────────────
  const comps: CompResult[] = []

  for (let i = 0; i < topCandidates.length; i++) {
    const { row, dealEV, targetSymbol } = topCandidates[i]
    const inc = targetFinancials[i]
    if (!inc) continue

    const tRev  = n(inc.revenue)
    const tEbitda = n(inc.ebitda)
    const tEbit = n(inc.operatingIncome)
    const tNI   = n(inc.netIncome)

    const evRevenue = (tRev  != null && tRev  > 0) ? dealEV / tRev  : null
    const evEbitda  = (tEbitda != null && tEbitda > 0) ? dealEV / tEbitda : null
    const evEbit    = (tEbit != null && tEbit > 0) ? dealEV / tEbit : null
    const equityNI  = (tNI   != null && tNI   > 0) ? dealEV / tNI  : null

    // Skip deals where we couldn't compute any multiple
    if (evRevenue == null && evEbitda == null && evEbit == null && equityNI == null) continue

    comps.push({
      targetSymbol,
      targetName: row.targetedCompanyName || targetSymbol,
      dealEV,
      dealDate: pickDate(row),
      evRevenue,
      evEbitda,
      evEbit,
      equityNI,
    })
  }

  const source: 'fmp' | 'none' = comps.length > 0 ? 'fmp' : 'none'

  // ── 5. Aggregate to Q1/median/Q3 and translate to implied prices ──────────
  function multipleRange(
    field: keyof Pick<CompResult, 'evRevenue' | 'evEbitda' | 'evEbit' | 'equityNI'>,
    subjectMetric: number | null,
    isEquityMultiple = false,
  ): { q1: number | null; median: number | null; q3: number | null; count: number } {
    const multiples = comps
      .map(c => c[field] as number | null)
      .filter((v): v is number => v != null && v > 0 && Number.isFinite(v))

    const count = multiples.length

    if (count < 2 || subjectMetric == null || subjectShares == null || subjectShares <= 0) {
      return { q1: null, median: null, q3: null, count }
    }

    const q1m  = quartile(multiples, 0.25)
    const medm = quartile(multiples, 0.5)
    const q3m  = quartile(multiples, 0.75)

    function toPrice(multiple: number | null): number | null {
      if (multiple == null) return null
      if (isEquityMultiple) {
        // P/E proxy: implied_price = multiple × EPS
        return subjectEps != null ? multiple * subjectEps : null
      }
      // EV multiple: implied_price = (multiple × metric/share) − netDebt/share
      const metricPerShare = subjectMetric / subjectShares
      const impliedEVPerShare = multiple * metricPerShare
      const ndps = netDebtPerShare ?? 0
      const price = impliedEVPerShare - ndps
      return price > 0 ? price : null
    }

    return {
      q1:     toPrice(q1m),
      median: toPrice(medm),
      q3:     toPrice(q3m),
      count,
    }
  }

  const implied = {
    evRevenue: multipleRange('evRevenue', subjectRevenue),
    evEbitda:  multipleRange('evEbitda',  subjectEbitda),
    evEbit:    multipleRange('evEbit',    subjectEbit),
    equityNI:  multipleRange('equityNI',  subjectNetIncome, true),
  }

  return NextResponse.json({
    symbol,
    industry,
    implied,
    comps: comps.slice(0, 20).map(c => ({
      targetSymbol: c.targetSymbol,
      targetName:   c.targetName,
      dealDate:     c.dealDate,
      dealEV:       c.dealEV,
      evRevenue:    c.evRevenue,
      evEbitda:     c.evEbitda,
      evEbit:       c.evEbit,
      equityNI:     c.equityNI,
    })),
    compCount: comps.length,
    source,
    subject: {
      revenue:      subjectRevenue,
      ebitda:       subjectEbitda,
      ebit:         subjectEbit,
      netIncome:    subjectNetIncome,
      shares:       subjectShares,
      netDebt:      subjectNetDebt,
      eps:          subjectEps,
    },
    note: [
      'Precedent transaction multiples sourced from FMP M&A filings.',
      'Deal value (totalDealValue) is used as a proxy for transaction enterprise value.',
      'EV multiples are bridged to equity value using the subject\'s most recent net debt.',
      'Implied equity/NI uses the deal value as a proxy for equity consideration (conservative when deals include significant debt).',
      'Multiples are based on target LTM financials at the period closest to the deal date.',
    ].join(' '),
    fetchedAt: new Date().toISOString(),
  })
}

// Factor / quant back-test engine for the Signals "Factor Lab".
//
// Clean-room reimplementation of the classic decile/quantile factor back-test
// (a staple of FinceptTerminal-style quant labs), written from textbook
// definitions — no upstream code copied. The engine is a pure function: the
// caller fetches historical daily bars (via /api/aggs) and a benchmark series,
// and this module ranks the universe by a chosen price-derived factor on every
// rebalance date, splits it into equal-weight quantile portfolios, holds each
// until the next rebalance, and reports decile-spread equity curves plus the
// standard risk summary (CAGR, vol, Sharpe, Sortino, max drawdown, Calmar, hit
// rate).
//
// Only price-derived factors are offered because daily bars are the one input
// we can source honestly for every covered name. Point-in-time fundamentals
// (value / quality factors) require a survivorship-bias-free fundamentals
// panel we do not yet license, so they are intentionally out of scope rather
// than synthesised.

import {
  stdev,
  annualizeVol,
  downsideStdev,
  maxDrawdownFromReturns,
  hitRate,
  cagrFromReturns,
  priceReturns,
} from './portfolio-analytics'

const DEFAULT_RISK_FREE_RATE = 0.04

// ── Factors ─────────────────────────────────────────────────────────────────

export type FactorKey =
  | 'mom_12_1'
  | 'mom_6_1'
  | 'lowvol_3m'
  | 'reversal_1m'
  | 'trend_52w'

export interface FactorDef {
  key: FactorKey
  label: string
  short: string
  help: string
  /** Trading-day lookback the factor needs before a symbol is rankable. */
  lookbackDays: number
}

export const FACTORS: FactorDef[] = [
  {
    key: 'mom_12_1',
    label: '12-1 Momentum',
    short: 'Mom 12-1',
    help: 'Trailing 12-month price return, skipping the most recent month. The classic cross-sectional momentum factor; high scores = strong recent trend.',
    lookbackDays: 252,
  },
  {
    key: 'mom_6_1',
    label: '6-1 Momentum',
    short: 'Mom 6-1',
    help: 'Trailing 6-month price return, skipping the most recent month. A faster momentum signal than 12-1.',
    lookbackDays: 126,
  },
  {
    key: 'lowvol_3m',
    label: 'Low Volatility',
    short: 'Low Vol',
    help: 'Inverse of trailing 63-day realised volatility. High scores = the calmest names; tests the low-volatility anomaly.',
    lookbackDays: 63,
  },
  {
    key: 'reversal_1m',
    label: 'Short-term Reversal',
    short: 'Reversal',
    help: 'Negative of the last 21-day return. High scores = recent losers, betting on a one-month bounce.',
    lookbackDays: 21,
  },
  {
    key: 'trend_52w',
    label: '52-Week High Proximity',
    short: '52w High',
    help: 'Current price divided by the trailing 252-day high. High scores = names trading near their one-year peak.',
    lookbackDays: 252,
  },
]

const FACTOR_BY_KEY: Record<FactorKey, FactorDef> = Object.fromEntries(
  FACTORS.map((f) => [f.key, f]),
) as Record<FactorKey, FactorDef>

// ── Curated universes ─────────────────────────────────────────────────────────
// Bounded, enumerable baskets so a back-test fetches a tractable number of
// series (the engine accepts any ticker list, but the UI exposes these plus a
// free-text custom list). These are fixed membership snapshots; they do not
// reconstruct historical index constituents, so survivorship bias applies and
// is disclosed in the UI methodology note.

export interface BacktestUniverse {
  key: string
  label: string
  symbols: string[]
  note?: string
}

export const BACKTEST_UNIVERSES: BacktestUniverse[] = [
  {
    key: 'dow30',
    label: 'Dow Jones 30',
    symbols: [
      'AAPL', 'AMGN', 'AXP', 'BA', 'CAT', 'CRM', 'CSCO', 'CVX', 'DIS', 'GS',
      'HD', 'HON', 'IBM', 'JNJ', 'JPM', 'KO', 'MCD', 'MMM', 'MRK', 'MSFT',
      'NKE', 'PG', 'TRV', 'UNH', 'V', 'VZ', 'WBA', 'WMT', 'AMZN', 'NVDA',
    ],
  },
  {
    key: 'megacap_tech',
    label: 'Mega-Cap Tech',
    symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AVGO', 'ORCL', 'ADBE', 'CRM', 'NFLX'],
  },
  {
    key: 'semis',
    label: 'Semiconductors',
    symbols: ['NVDA', 'AMD', 'AVGO', 'INTC', 'QCOM', 'TXN', 'MU', 'ADI', 'AMAT', 'LRCX', 'KLAC', 'MRVL', 'NXPI', 'ON'],
  },
  {
    key: 'banks',
    label: 'US Large Banks',
    symbols: ['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'USB', 'PNC', 'TFC', 'COF', 'SCHW', 'BK'],
  },
  {
    key: 'energy',
    label: 'Energy Majors',
    symbols: ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'MPC', 'VLO', 'OXY', 'WMB', 'KMI', 'HAL'],
  },
  {
    key: 'staples',
    label: 'Consumer Staples',
    symbols: ['PG', 'KO', 'PEP', 'COST', 'WMT', 'MDLZ', 'CL', 'MO', 'PM', 'KMB', 'GIS', 'KHC'],
  },
]

export type RebalanceFreq = 'monthly' | 'quarterly' | 'semiannual' | 'annual'

export const REBALANCE_FREQS: { key: RebalanceFreq; label: string; periodsPerYear: number }[] = [
  { key: 'monthly', label: 'Monthly', periodsPerYear: 12 },
  { key: 'quarterly', label: 'Quarterly', periodsPerYear: 4 },
  { key: 'semiannual', label: 'Semi-annual', periodsPerYear: 2 },
  { key: 'annual', label: 'Annual', periodsPerYear: 1 },
]

const PPY_BY_FREQ: Record<RebalanceFreq, number> = {
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
}

// ── I/O types ─────────────────────────────────────────────────────────────────

export interface PriceBar {
  date: string // YYYY-MM-DD
  close: number
}

export interface BacktestConfig {
  factor: FactorKey
  quantiles: number // 3 | 4 | 5 | 10
  rebalance: RebalanceFreq
  riskFreeRate?: number
}

export interface BacktestSummary {
  cagr: number
  vol: number
  sharpe: number
  sortino: number
  maxDrawdown: number
  calmar: number
  hitRate: number
  totalReturn: number
}

export interface BacktestSeriesPoint {
  date: string
  topQ: number // equity index, base 1.0
  bottomQ: number
  longShort: number
  benchmark: number
}

export interface QuantileBucket {
  quantile: number // 1 = top (highest score)
  label: string
  avgReturn: number // mean per-period return across windows
  cagr: number
}

export interface RankingRow {
  rank: number
  symbol: string
  score: number
  quantile: number
}

export interface BacktestResult {
  ok: true
  config: BacktestConfig
  factorLabel: string
  benchmarkLabel: string
  periodsPerYear: number
  from: string
  to: string
  rebalanceDates: string[]
  windows: number
  series: BacktestSeriesPoint[]
  quantileBuckets: QuantileBucket[]
  summary: {
    long: BacktestSummary
    longShort: BacktestSummary
    benchmark: BacktestSummary
  }
  ranking: RankingRow[] // snapshot at the final rebalance
  rankingDate: string
  universeSize: number
  coveredSymbols: string[]
  droppedSymbols: string[]
}

export interface BacktestEmpty {
  ok: false
  reason: 'insufficient_data' | 'no_universe'
  message: string
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface IndexedSeries {
  dates: string[]
  closes: number[]
  byDate: Map<string, number> // date -> array index
}

function indexSeries(bars: PriceBar[]): IndexedSeries {
  const sorted = [...bars]
    .filter((b) => Number.isFinite(b.close) && b.close > 0 && !!b.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const dates: string[] = []
  const closes: number[] = []
  const byDate = new Map<string, number>()
  for (const b of sorted) {
    byDate.set(b.date, dates.length)
    dates.push(b.date)
    closes.push(b.close)
  }
  return { dates, closes, byDate }
}

/** Index of the last bar on or before `date`, or -1 if none. */
function indexAsOf(s: IndexedSeries, date: string): number {
  const exact = s.byDate.get(date)
  if (exact != null) return exact
  // binary search for largest date <= target
  let lo = 0
  let hi = s.dates.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (s.dates[mid] <= date) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

/** Compute the factor score for a series at bar index `i` (inclusive). */
function factorScore(factor: FactorKey, closes: number[], i: number): number | null {
  const need = FACTOR_BY_KEY[factor].lookbackDays
  if (i < need) return null
  switch (factor) {
    case 'mom_12_1': {
      const a = closes[i - 252]
      const b = closes[i - 21]
      if (!(a > 0) || !(b > 0)) return null
      return b / a - 1
    }
    case 'mom_6_1': {
      const a = closes[i - 126]
      const b = closes[i - 21]
      if (!(a > 0) || !(b > 0)) return null
      return b / a - 1
    }
    case 'lowvol_3m': {
      const window = closes.slice(i - 63, i + 1)
      const rets = priceReturns(window)
      if (rets.length < 10) return null
      const vol = stdev(rets)
      return vol > 0 ? -vol : 0
    }
    case 'reversal_1m': {
      const a = closes[i - 21]
      const b = closes[i]
      if (!(a > 0) || !(b > 0)) return null
      return -(b / a - 1)
    }
    case 'trend_52w': {
      const window = closes.slice(i - 252, i + 1)
      let max = 0
      for (const c of window) if (c > max) max = c
      if (!(max > 0)) return null
      return closes[i] / max
    }
    default:
      return null
  }
}

/**
 * Build the rebalance calendar from the benchmark's trading days. We pick the
 * first trading day in each period (month / quarter / …) so windows align to a
 * real market session.
 */
function rebalanceCalendar(benchDates: string[], freq: RebalanceFreq): string[] {
  if (!benchDates.length) return []
  const bucketKey = (d: string): string => {
    const [y, m] = d.split('-')
    const month = parseInt(m, 10)
    switch (freq) {
      case 'monthly':
        return `${y}-${m}`
      case 'quarterly':
        return `${y}-Q${Math.floor((month - 1) / 3)}`
      case 'semiannual':
        return `${y}-H${Math.floor((month - 1) / 6)}`
      case 'annual':
        return `${y}`
    }
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const d of benchDates) {
    const k = bucketKey(d)
    if (!seen.has(k)) {
      seen.add(k)
      out.push(d)
    }
  }
  return out
}

function quantileLabel(q: number, total: number): string {
  if (q === 1) return total === 10 ? 'D1 (top)' : `Q1 (top)`
  if (q === total) return total === 10 ? `D${total} (bottom)` : `Q${total} (bottom)`
  return total === 10 ? `D${q}` : `Q${q}`
}

function summarize(returns: number[], years: number, ppy: number, rf: number): BacktestSummary {
  if (!returns.length) {
    return { cagr: 0, vol: 0, sharpe: 0, sortino: 0, maxDrawdown: 0, calmar: 0, hitRate: 0, totalReturn: 0 }
  }
  const cagr = cagrFromReturns(returns, years)
  const vol = annualizeVol(stdev(returns), ppy)
  const annualDownside = annualizeVol(downsideStdev(returns, rf / ppy), ppy)
  const sharpe = vol > 0 ? (cagr - rf) / vol : 0
  const sortino = annualDownside > 0 ? (cagr - rf) / annualDownside : 0
  const mdd = maxDrawdownFromReturns(returns)
  const calmar = mdd < 0 ? cagr / Math.abs(mdd) : 0
  let equity = 1
  for (const r of returns) equity *= 1 + r
  return {
    cagr,
    vol,
    sharpe,
    sortino,
    maxDrawdown: mdd,
    calmar,
    hitRate: hitRate(returns),
    totalReturn: equity - 1,
  }
}

// ── Engine ─────────────────────────────────────────────────────────────────────

export interface RunBacktestArgs {
  config: BacktestConfig
  priceSeriesBySymbol: Record<string, PriceBar[]>
  benchmark: PriceBar[]
  benchmarkLabel?: string
}

export function runBacktest(args: RunBacktestArgs): BacktestResult | BacktestEmpty {
  const { config, priceSeriesBySymbol, benchmark } = args
  const benchmarkLabel = args.benchmarkLabel ?? 'Benchmark'
  const symbols = Object.keys(priceSeriesBySymbol)
  if (symbols.length < 2) {
    return { ok: false, reason: 'no_universe', message: 'A back-test needs at least two symbols with price history.' }
  }

  const quantiles = Math.max(2, Math.min(10, Math.floor(config.quantiles) || 5))
  const ppy = PPY_BY_FREQ[config.rebalance]
  const rf = config.riskFreeRate ?? DEFAULT_RISK_FREE_RATE

  const indexed: Record<string, IndexedSeries> = {}
  for (const s of symbols) indexed[s] = indexSeries(priceSeriesBySymbol[s])
  const bench = indexSeries(benchmark)
  if (bench.dates.length < 2) {
    return { ok: false, reason: 'insufficient_data', message: 'Benchmark price history is unavailable for this range.' }
  }

  const rebal = rebalanceCalendar(bench.dates, config.rebalance)
  if (rebal.length < 2) {
    return {
      ok: false,
      reason: 'insufficient_data',
      message: 'Not enough history in the selected range to form a single rebalance window. Widen the date range or use a faster rebalance frequency.',
    }
  }

  // We need at least one symbol rankable at the first window. Track which
  // symbols ever produce a score so we can report coverage honestly.
  const everScored = new Set<string>()

  // Per-window quantile returns + benchmark return.
  const windowCount = rebal.length - 1
  const qReturnsByWindow: number[][] = [] // [windowIdx][quantileIdx 0..q-1]
  const benchReturns: number[] = []
  const usableRebalDates: string[] = [] // start dates of usable windows
  let lastRanking: RankingRow[] = []
  let lastRankingDate = ''

  for (let w = 0; w < windowCount; w++) {
    const dStart = rebal[w]
    const dEnd = rebal[w + 1]

    // Rank symbols by factor score as-of dStart.
    const scored: { symbol: string; score: number; fwd: number }[] = []
    for (const sym of symbols) {
      const s = indexed[sym]
      const iStart = indexAsOf(s, dStart)
      if (iStart < 0) continue
      const score = factorScore(config.factor, s.closes, iStart)
      if (score == null || !Number.isFinite(score)) continue
      const iEnd = indexAsOf(s, dEnd)
      if (iEnd < 0 || iEnd <= iStart) continue
      const cStart = s.closes[iStart]
      const cEnd = s.closes[iEnd]
      if (!(cStart > 0) || !(cEnd > 0)) continue
      everScored.add(sym)
      scored.push({ symbol: sym, score, fwd: cEnd / cStart - 1 })
    }

    // Need enough names to populate each quantile.
    if (scored.length < quantiles) continue

    // Benchmark forward return over the same window.
    const bStart = indexAsOf(bench, dStart)
    const bEnd = indexAsOf(bench, dEnd)
    if (bStart < 0 || bEnd <= bStart) continue
    const benchFwd = bench.closes[bEnd] / bench.closes[bStart] - 1

    // Sort by score descending; quantile 1 = highest score.
    scored.sort((a, b) => b.score - a.score)
    const n = scored.length
    const buckets: number[][] = Array.from({ length: quantiles }, () => [])
    const assignment: number[] = new Array(n)
    for (let i = 0; i < n; i++) {
      // even split; floor maps top indices to quantile 1
      const q = Math.min(quantiles - 1, Math.floor((i * quantiles) / n))
      buckets[q].push(scored[i].fwd)
      assignment[i] = q + 1
    }

    const qReturns = buckets.map((arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0))
    qReturnsByWindow.push(qReturns)
    benchReturns.push(benchFwd)
    usableRebalDates.push(dStart)

    // Snapshot the ranking at the last usable window.
    lastRanking = scored.map((row, i) => ({
      rank: i + 1,
      symbol: row.symbol,
      score: row.score,
      quantile: assignment[i],
    }))
    lastRankingDate = dStart
  }

  if (qReturnsByWindow.length < 1) {
    return {
      ok: false,
      reason: 'insufficient_data',
      message: 'No rebalance window had enough symbols with sufficient price history to rank. Try a longer date range, a larger universe, or a factor with a shorter lookback.',
    }
  }

  // End date of each window is the next rebalance date; build per-quantile and
  // benchmark equity curves indexed to 1.0 at the first window start.
  const windowEndDates: string[] = []
  for (let w = 0; w < usableRebalDates.length; w++) {
    // window end = the rebal date immediately after this start in `rebal`
    const startIdx = rebal.indexOf(usableRebalDates[w])
    windowEndDates.push(rebal[startIdx + 1])
  }

  const topReturns = qReturnsByWindow.map((r) => r[0])
  const bottomReturns = qReturnsByWindow.map((r) => r[quantiles - 1])
  const longShortReturns = topReturns.map((r, i) => r - bottomReturns[i])

  const series: BacktestSeriesPoint[] = []
  let eqTop = 1
  let eqBottom = 1
  let eqLS = 1
  let eqBench = 1
  series.push({ date: usableRebalDates[0], topQ: 1, bottomQ: 1, longShort: 1, benchmark: 1 })
  for (let i = 0; i < windowEndDates.length; i++) {
    eqTop *= 1 + topReturns[i]
    eqBottom *= 1 + bottomReturns[i]
    eqLS *= 1 + longShortReturns[i]
    eqBench *= 1 + benchReturns[i]
    series.push({
      date: windowEndDates[i],
      topQ: eqTop,
      bottomQ: eqBottom,
      longShort: eqLS,
      benchmark: eqBench,
    })
  }

  const from = series[0].date
  const to = series[series.length - 1].date
  const years = Math.max(
    (new Date(to).getTime() - new Date(from).getTime()) / (365.25 * 86400000),
    1e-6,
  )

  // Average per-quantile return for the spread bar chart.
  const quantileBuckets: QuantileBucket[] = []
  for (let q = 0; q < quantiles; q++) {
    const colReturns = qReturnsByWindow.map((r) => r[q])
    const avg = colReturns.reduce((s, x) => s + x, 0) / colReturns.length
    quantileBuckets.push({
      quantile: q + 1,
      label: quantileLabel(q + 1, quantiles),
      avgReturn: avg,
      cagr: cagrFromReturns(colReturns, years),
    })
  }

  const summary = {
    long: summarize(topReturns, years, ppy, rf),
    longShort: summarize(longShortReturns, years, ppy, rf),
    benchmark: summarize(benchReturns, years, ppy, rf),
  }

  const dropped = symbols.filter((s) => !everScored.has(s))

  return {
    ok: true,
    config: { ...config, quantiles },
    factorLabel: FACTOR_BY_KEY[config.factor].label,
    benchmarkLabel,
    periodsPerYear: ppy,
    from,
    to,
    rebalanceDates: usableRebalDates,
    windows: usableRebalDates.length,
    series,
    quantileBuckets,
    summary,
    ranking: lastRanking,
    rankingDate: lastRankingDate,
    universeSize: symbols.length,
    coveredSymbols: [...everScored].sort(),
    droppedSymbols: dropped.sort(),
  }
}

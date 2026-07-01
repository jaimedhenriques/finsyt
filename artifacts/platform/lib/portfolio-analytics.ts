/**
 * Portfolio Analytics — Risk & Return Math
 * ────────────────────────────────────────
 * Pure-function library implementing the standard CFA / institutional risk
 * metrics. No external data dependencies — callers feed in price series
 * (positions × historical bars) and a benchmark series.
 *
 * Inspired by the QuantLib / risk modules in the FinceptTerminal feature
 * catalog. Re-implemented from textbook formulas; no upstream code copied.
 *
 * All annualization uses sqrt(252) for daily series; pass `periodsPerYear`
 * for weekly (52) or monthly (12).
 *
 * Used by:
 *   - /api/portfolio/analytics endpoint (workspace-scoped)
 *   - /api/v1/portfolio/analytics endpoint (public, key-gated)
 */

const DEFAULT_PERIODS_PER_YEAR = 252
const DEFAULT_RISK_FREE_RATE = 0.04 // 4 % annual; UI may override

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function priceReturns(prices: number[]): number[] {
  const r: number[] = []
  for (let i = 1; i < prices.length; i++) {
    const a = prices[i - 1], b = prices[i]
    if (a > 0 && Number.isFinite(a) && Number.isFinite(b)) r.push(b / a - 1)
  }
  return r
}

export function mean(xs: number[]): number {
  if (!xs.length) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

export function variance(xs: number[], opts?: { sample?: boolean }): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  let s = 0
  for (const x of xs) s += (x - m) ** 2
  return s / (xs.length - (opts?.sample === false ? 0 : 1))
}

export function stdev(xs: number[], opts?: { sample?: boolean }): number {
  return Math.sqrt(variance(xs, opts))
}

export function downsideStdev(xs: number[], minAcceptableReturn = 0): number {
  if (xs.length < 2) return 0
  const downside = xs.map(x => Math.min(0, x - minAcceptableReturn) ** 2)
  let s = 0
  for (const v of downside) s += v
  return Math.sqrt(s / (xs.length - 1))
}

export function annualize(periodicMean: number, periodsPerYear = DEFAULT_PERIODS_PER_YEAR): number {
  return periodicMean * periodsPerYear
}

export function annualizeVol(periodicStdev: number, periodsPerYear = DEFAULT_PERIODS_PER_YEAR): number {
  return periodicStdev * Math.sqrt(periodsPerYear)
}

/** Fraction of periods with a strictly positive return (0..1). */
export function hitRate(returns: number[]): number {
  if (!returns.length) return 0
  let wins = 0
  for (const r of returns) if (r > 0) wins++
  return wins / returns.length
}

/**
 * Compound a series of periodic returns into a Compound Annual Growth Rate.
 * `years` is the elapsed wall-clock time the series spans (not period count),
 * so monthly/quarterly series annualise correctly. Returns a decimal.
 */
export function cagrFromReturns(returns: number[], years: number): number {
  if (!returns.length || years <= 0) return 0
  let equity = 1
  for (const r of returns) equity *= 1 + r
  if (equity <= 0) return -1
  return equity ** (1 / years) - 1
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk metrics
// ─────────────────────────────────────────────────────────────────────────────

export interface RiskMetrics {
  /** Annualized total return (CAGR-equivalent based on arithmetic mean × periods/yr). */
  annualReturn: number
  /** Annualized volatility (stdev × sqrt(periods/yr)). */
  annualVol: number
  /** Sharpe ratio = (annual return − rf) / annual vol. */
  sharpe: number
  /** Sortino ratio = (annual return − rf) / annualized downside vol. */
  sortino: number
  /** Maximum peak-to-trough drawdown (negative). */
  maxDrawdown: number
  /** Calmar ratio = annual return / |max drawdown|. */
  calmar: number
  /** Historical Value-at-Risk at the configured percentile (negative). */
  var95: number
  /** Historical Value-at-Risk at 99 % (negative). */
  var99: number
  /** Conditional Value-at-Risk at 95 % (mean of worst 5 % returns; negative). */
  cvar95: number
  /** Beta vs benchmark (cov / benchmark variance). */
  beta: number | null
  /** Alpha vs benchmark, annualized. */
  alpha: number | null
  /** R^2 of returns regressed on benchmark. */
  rSquared: number | null
  /** Correlation with benchmark. */
  correlation: number | null
  /** Tracking error: annualized stdev of (portfolio − benchmark) returns. */
  trackingError: number | null
  /** Information ratio = annualized active return / tracking error. */
  informationRatio: number | null
}

export interface RiskMetricsOpts {
  riskFreeRate?: number          // annualized, decimal (0.04 = 4 %)
  periodsPerYear?: number        // 252 daily, 52 weekly, 12 monthly
  benchmarkReturns?: number[]    // periodic returns aligned 1:1 with portfolio returns
}

/** Maximum peak-to-trough drawdown across an equity curve. */
export function maxDrawdownFromReturns(returns: number[]): number {
  if (!returns.length) return 0
  let equity = 1
  let peak = 1
  let mdd = 0
  for (const r of returns) {
    equity *= 1 + r
    if (equity > peak) peak = equity
    const dd = equity / peak - 1
    if (dd < mdd) mdd = dd
  }
  return mdd
}

/** Historical VaR at the given percentile (e.g. 0.05 for 95 %). Returns a negative number. */
export function historicalVar(returns: number[], percentile = 0.05): number {
  if (!returns.length) return 0
  const sorted = [...returns].sort((a, b) => a - b)
  const idx = Math.max(0, Math.floor(percentile * sorted.length) - 1)
  return sorted[idx]
}

/** Conditional VaR (expected shortfall): mean of returns ≤ VaR. */
export function historicalCvar(returns: number[], percentile = 0.05): number {
  if (!returns.length) return 0
  const sorted = [...returns].sort((a, b) => a - b)
  const cut = Math.max(1, Math.floor(percentile * sorted.length))
  const tail = sorted.slice(0, cut)
  return mean(tail)
}

/** Linear regression of y on x: returns { alpha, beta, r2, correlation }. */
export function regress(y: number[], x: number[]): { alpha: number; beta: number; r2: number; correlation: number } {
  const n = Math.min(x.length, y.length)
  if (n < 2) return { alpha: 0, beta: 0, r2: 0, correlation: 0 }
  const xs = x.slice(0, n), ys = y.slice(0, n)
  const mx = mean(xs), my = mean(ys)
  let sxx = 0, syy = 0, sxy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  if (sxx === 0) return { alpha: 0, beta: 0, r2: 0, correlation: 0 }
  const beta = sxy / sxx
  const alpha = my - beta * mx
  const r2 = (sxy * sxy) / (sxx * syy || 1)
  const correlation = sxy / (Math.sqrt(sxx * syy) || 1)
  return { alpha, beta, r2, correlation }
}

/**
 * Compute the full risk-metric panel for a return series.
 *
 * @param returns periodic returns of the portfolio (decimals, e.g. 0.012 = 1.2 %)
 * @param opts    optional benchmark, risk-free rate, periodicity
 */
export function computeRiskMetrics(returns: number[], opts: RiskMetricsOpts = {}): RiskMetrics {
  const periodsPerYear = opts.periodsPerYear ?? DEFAULT_PERIODS_PER_YEAR
  const rf = opts.riskFreeRate ?? DEFAULT_RISK_FREE_RATE
  const rfPeriodic = rf / periodsPerYear

  const annualReturn = annualize(mean(returns), periodsPerYear)
  const annualVol = annualizeVol(stdev(returns), periodsPerYear)
  const downside = downsideStdev(returns, rfPeriodic)
  const annualDownside = annualizeVol(downside, periodsPerYear)

  const sharpe = annualVol > 0 ? (annualReturn - rf) / annualVol : 0
  const sortino = annualDownside > 0 ? (annualReturn - rf) / annualDownside : 0
  const mdd = maxDrawdownFromReturns(returns)
  const calmar = mdd < 0 ? annualReturn / Math.abs(mdd) : 0
  const var95 = historicalVar(returns, 0.05)
  const var99 = historicalVar(returns, 0.01)
  const cvar95 = historicalCvar(returns, 0.05)

  let beta: number | null = null
  let alpha: number | null = null
  let rSquared: number | null = null
  let correlation: number | null = null
  let trackingError: number | null = null
  let informationRatio: number | null = null

  if (opts.benchmarkReturns && opts.benchmarkReturns.length >= 2) {
    const reg = regress(returns, opts.benchmarkReturns)
    beta = reg.beta
    alpha = reg.alpha * periodsPerYear // annualize per-period alpha
    rSquared = reg.r2
    correlation = reg.correlation

    const n = Math.min(returns.length, opts.benchmarkReturns.length)
    const active: number[] = []
    for (let i = 0; i < n; i++) active.push(returns[i] - opts.benchmarkReturns[i])
    const teRaw = stdev(active)
    trackingError = annualizeVol(teRaw, periodsPerYear)
    const annualActive = annualize(mean(active), periodsPerYear)
    informationRatio = trackingError > 0 ? annualActive / trackingError : 0
  }

  return {
    annualReturn,
    annualVol,
    sharpe,
    sortino,
    maxDrawdown: mdd,
    calmar,
    var95,
    var99,
    cvar95,
    beta,
    alpha,
    rSquared,
    correlation,
    trackingError,
    informationRatio,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Position-level concentration & contribution
// ─────────────────────────────────────────────────────────────────────────────

export interface PositionContribution {
  symbol: string
  weight: number
  /** Risk contribution as % of portfolio variance (Marginal × weight). */
  riskContribution: number
  /** Volatility of the position itself (annualized). */
  vol: number
  /** Beta vs the rest of the portfolio. */
  betaToPortfolio: number | null
}

/**
 * Decompose portfolio variance into per-position contributions. Requires
 * a returns matrix (rows = periods, cols = positions) aligned with weights.
 */
export function riskContributions(
  weights: number[],
  returnsMatrix: number[][],
  periodsPerYear = DEFAULT_PERIODS_PER_YEAR,
): PositionContribution[] {
  if (!returnsMatrix.length || !weights.length) return []
  const T = returnsMatrix.length
  const N = weights.length

  // Compute mean per asset
  const means = new Array<number>(N).fill(0)
  for (let j = 0; j < N; j++) {
    let s = 0
    for (let t = 0; t < T; t++) s += returnsMatrix[t][j] || 0
    means[j] = s / T
  }

  // Covariance matrix (sample)
  const cov: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0))
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      let s = 0
      for (let t = 0; t < T; t++) {
        s += (returnsMatrix[t][i] - means[i]) * (returnsMatrix[t][j] - means[j])
      }
      const v = s / Math.max(1, T - 1)
      cov[i][j] = v
      cov[j][i] = v
    }
  }

  // Portfolio variance: w' Σ w
  let portVar = 0
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      portVar += weights[i] * weights[j] * cov[i][j]
    }
  }

  // Marginal contribution to risk: (Σ w)_i; risk contribution = w_i * MCR_i
  const mcr = new Array<number>(N).fill(0)
  for (let i = 0; i < N; i++) {
    let row = 0
    for (let j = 0; j < N; j++) row += cov[i][j] * weights[j]
    mcr[i] = row
  }

  return weights.map((w, i) => {
    const rc = portVar > 0 ? (w * mcr[i]) / portVar : 0
    const vol = annualizeVol(Math.sqrt(cov[i][i]), periodsPerYear)
    // Beta to portfolio = MCR / portVar (intuition: position covariance with portfolio / port var)
    const betaToPortfolio = portVar > 0 ? mcr[i] / portVar : null
    return {
      symbol: String(i), // caller fills in real symbols
      weight: w,
      riskContribution: rc,
      vol,
      betaToPortfolio,
    }
  })
}

/**
 * Build an aligned returns matrix from a {symbol → priceSeries} map, using
 * the longest common date range. Returns `{ matrix, symbols }`.
 */
export function alignedReturnsMatrix(priceSeriesBySymbol: Record<string, Array<{ date: string; close: number }>>): {
  matrix: number[][]
  symbols: string[]
  dates: string[]
} {
  const symbols = Object.keys(priceSeriesBySymbol)
  if (!symbols.length) return { matrix: [], symbols: [], dates: [] }

  // Index each series by date.
  const byDate: Record<string, Map<string, number>> = {}
  for (const s of symbols) {
    byDate[s] = new Map(priceSeriesBySymbol[s].map(p => [p.date, p.close]))
  }
  // Take dates present in every series, sorted ascending.
  const allDates = symbols
    .map(s => priceSeriesBySymbol[s].map(p => p.date))
  let common = new Set<string>(allDates[0] || [])
  for (let i = 1; i < allDates.length; i++) {
    const next = new Set<string>(allDates[i])
    common = new Set([...common].filter(d => next.has(d)))
  }
  const dates = [...common].sort()

  // Build close-price matrix then convert to returns row by row.
  const closeMatrix: number[][] = dates.map(d => symbols.map(s => byDate[s].get(d) ?? NaN))
  const matrix: number[][] = []
  for (let t = 1; t < closeMatrix.length; t++) {
    const row: number[] = []
    let valid = true
    for (let j = 0; j < symbols.length; j++) {
      const a = closeMatrix[t - 1][j], b = closeMatrix[t][j]
      if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) { valid = false; break }
      row.push(b / a - 1)
    }
    if (valid) matrix.push(row)
  }

  return { matrix, symbols, dates: dates.slice(1) }
}

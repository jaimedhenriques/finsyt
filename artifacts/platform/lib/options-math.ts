/**
 * Options analytics — Black–Scholes pricing, Greeks, implied volatility, and
 * strategy-payoff math.
 *
 * Pure-function library (no I/O) so it can be:
 *   - called server-side by /api/options to fill in Greeks the upstream
 *     provider did not supply, and
 *   - imported client-side by the Options tab strategy builder to draw payoff
 *     diagrams and compute max profit / loss / breakevens.
 *
 * Re-implemented from the standard Black–Scholes–Merton formulas (Hull,
 * "Options, Futures and Other Derivatives") — no third-party code copied.
 *
 * Conventions for the Greeks returned by {@link blackScholesGreeks}:
 *   - delta : per $1 move in the underlying           (dimensionless, calls 0..1, puts -1..0)
 *   - gamma : delta change per $1 move                (per $1)
 *   - theta : time decay PER CALENDAR DAY             (price change per day; usually negative)
 *   - vega  : price change per +1 VOLATILITY POINT    (i.e. per +1% absolute vol)
 *   - rho   : price change per +1% absolute rate move (per 1 percentage point)
 *
 * These match how desks/most data vendors display Greeks, so a computed row
 * sits naturally next to an upstream (Polygon) row.
 */

export type OptionType = 'call' | 'put'

export interface BsInputs {
  /** Spot price of the underlying. */
  spot: number
  /** Strike price. */
  strike: number
  /** Time to expiry in YEARS (e.g. 30 days ≈ 0.0822). */
  timeToExpiry: number
  /** Risk-free rate, decimal (e.g. 0.04 = 4%). */
  rate: number
  /** Volatility, decimal annualised (e.g. 0.25 = 25%). */
  volatility: number
  /** Continuous dividend yield, decimal. Default 0. */
  dividendYield?: number
}

export interface Greeks {
  delta: number
  gamma: number
  theta: number
  vega: number
  rho: number
}

const SQRT_2PI = Math.sqrt(2 * Math.PI)

/** Standard-normal probability density function. */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI
}

/**
 * Standard-normal cumulative distribution function.
 * Abramowitz & Stegun 7.1.26 approximation (max abs error ~7.5e-8).
 */
export function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const z = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * z)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-z * z)
  return 0.5 * (1 + sign * y)
}

function d1d2(i: BsInputs): { d1: number; d2: number; q: number } {
  const q = i.dividendYield ?? 0
  const vSqrtT = i.volatility * Math.sqrt(i.timeToExpiry)
  const d1 =
    (Math.log(i.spot / i.strike) + (i.rate - q + 0.5 * i.volatility * i.volatility) * i.timeToExpiry) /
    vSqrtT
  const d2 = d1 - vSqrtT
  return { d1, d2, q }
}

/**
 * Black–Scholes(-Merton) theoretical price for a European option.
 * Returns intrinsic value at expiry (or for degenerate vol/time inputs).
 */
export function blackScholesPrice(type: OptionType, i: BsInputs): number {
  // Degenerate inputs → fall back to discounted intrinsic value so callers
  // never get a NaN.
  if (!(i.timeToExpiry > 0) || !(i.volatility > 0) || !(i.spot > 0) || !(i.strike > 0)) {
    const intrinsic = type === 'call' ? Math.max(i.spot - i.strike, 0) : Math.max(i.strike - i.spot, 0)
    return intrinsic
  }
  const { d1, d2, q } = d1d2(i)
  const discS = i.spot * Math.exp(-q * i.timeToExpiry)
  const discK = i.strike * Math.exp(-i.rate * i.timeToExpiry)
  if (type === 'call') {
    return discS * normCdf(d1) - discK * normCdf(d2)
  }
  return discK * normCdf(-d2) - discS * normCdf(-d1)
}

/**
 * Full Greek set for a European option, scaled to desk/vendor display
 * conventions (see file header).
 */
export function blackScholesGreeks(type: OptionType, i: BsInputs): Greeks {
  if (!(i.timeToExpiry > 0) || !(i.volatility > 0) || !(i.spot > 0) || !(i.strike > 0)) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 }
  }
  const { d1, d2, q } = d1d2(i)
  const T = i.timeToExpiry
  const sqrtT = Math.sqrt(T)
  const discDiv = Math.exp(-q * T)
  const discRate = Math.exp(-i.rate * T)
  const pdfD1 = normPdf(d1)

  // Gamma & vega are sign-agnostic across calls/puts.
  const gamma = (discDiv * pdfD1) / (i.spot * i.volatility * sqrtT)
  // Vega per +1 vol POINT (i.e. per +1% absolute vol) → divide raw vega by 100.
  const vegaRaw = i.spot * discDiv * pdfD1 * sqrtT
  const vega = vegaRaw / 100

  let delta: number
  let thetaRaw: number
  let rhoRaw: number
  if (type === 'call') {
    delta = discDiv * normCdf(d1)
    thetaRaw =
      -(i.spot * discDiv * pdfD1 * i.volatility) / (2 * sqrtT) -
      i.rate * i.strike * discRate * normCdf(d2) +
      q * i.spot * discDiv * normCdf(d1)
    rhoRaw = i.strike * T * discRate * normCdf(d2)
  } else {
    delta = discDiv * (normCdf(d1) - 1)
    thetaRaw =
      -(i.spot * discDiv * pdfD1 * i.volatility) / (2 * sqrtT) +
      i.rate * i.strike * discRate * normCdf(-d2) -
      q * i.spot * discDiv * normCdf(-d1)
    rhoRaw = -i.strike * T * discRate * normCdf(-d2)
  }

  return {
    delta,
    gamma,
    // Theta per CALENDAR DAY.
    theta: thetaRaw / 365,
    vega,
    // Rho per +1% absolute rate move.
    rho: rhoRaw / 100,
  }
}

/**
 * Implied volatility from a market option price, via Newton–Raphson with a
 * bisection fallback for robustness. Returns null when no sensible IV exists
 * (e.g. price below intrinsic, or non-convergent).
 */
export function impliedVolatility(
  type: OptionType,
  marketPrice: number,
  i: Omit<BsInputs, 'volatility'>,
): number | null {
  if (!(marketPrice > 0) || !(i.timeToExpiry > 0) || !(i.spot > 0) || !(i.strike > 0)) return null

  const q = i.dividendYield ?? 0
  const intrinsic =
    type === 'call'
      ? Math.max(i.spot * Math.exp(-q * i.timeToExpiry) - i.strike * Math.exp(-i.rate * i.timeToExpiry), 0)
      : Math.max(i.strike * Math.exp(-i.rate * i.timeToExpiry) - i.spot * Math.exp(-q * i.timeToExpiry), 0)
  // Below the no-arbitrage floor → no real IV.
  if (marketPrice < intrinsic - 1e-6) return null

  const priceAt = (vol: number) => blackScholesPrice(type, { ...i, volatility: vol })

  // Newton–Raphson seeded near a typical equity-option vol.
  let vol = 0.25
  for (let iter = 0; iter < 50; iter++) {
    const price = priceAt(vol)
    const diff = price - marketPrice
    if (Math.abs(diff) < 1e-6) return vol
    // Raw vega (per 1.0 vol) for Newton step.
    const { d1 } = d1d2({ ...i, volatility: vol })
    const vega = i.spot * Math.exp(-q * i.timeToExpiry) * normPdf(d1) * Math.sqrt(i.timeToExpiry)
    if (!(vega > 1e-8)) break
    const next = vol - diff / vega
    if (!Number.isFinite(next)) break
    vol = Math.min(Math.max(next, 1e-4), 10)
  }

  // Bisection fallback over a wide vol bracket.
  let lo = 1e-4
  let hi = 10
  let loDiff = priceAt(lo) - marketPrice
  for (let iter = 0; iter < 100; iter++) {
    const mid = 0.5 * (lo + hi)
    const midDiff = priceAt(mid) - marketPrice
    if (Math.abs(midDiff) < 1e-6) return mid
    if (loDiff * midDiff <= 0) {
      hi = mid
    } else {
      lo = mid
      loDiff = midDiff
    }
  }
  const candidate = 0.5 * (lo + hi)
  return Number.isFinite(candidate) ? candidate : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy payoff math
// ─────────────────────────────────────────────────────────────────────────────

export type LegKind = 'call' | 'put' | 'stock'
export type LegSide = 'long' | 'short'

export interface StrategyLeg {
  kind: LegKind
  side: LegSide
  /** Strike (ignored for stock legs). */
  strike?: number
  /** Premium paid/received per share for option legs, or entry price for stock. */
  premium: number
  /** Number of contracts (options) or share lots. Each contract = 100 shares. */
  quantity: number
  /** Shares per contract. Default 100 for options, 1 for stock. */
  contractSize?: number
}

/** Net cash flow at entry: positive = credit received, negative = debit paid. */
export function netEntryCashflow(legs: StrategyLeg[]): number {
  let cash = 0
  for (const leg of legs) {
    const size = leg.contractSize ?? (leg.kind === 'stock' ? 1 : 100)
    const notional = leg.premium * leg.quantity * size
    // Long pays (debit), short receives (credit).
    cash += leg.side === 'short' ? notional : -notional
  }
  return cash
}

/** Total profit/loss of the whole position if the underlying settles at `price`. */
export function payoffAtPrice(legs: StrategyLeg[], price: number): number {
  let pnl = 0
  for (const leg of legs) {
    const size = leg.contractSize ?? (leg.kind === 'stock' ? 1 : 100)
    const qty = leg.quantity * size
    const dir = leg.side === 'long' ? 1 : -1
    let intrinsic: number
    if (leg.kind === 'stock') {
      intrinsic = price - leg.premium
      pnl += dir * intrinsic * qty
    } else {
      const k = leg.strike ?? 0
      intrinsic = leg.kind === 'call' ? Math.max(price - k, 0) : Math.max(k - price, 0)
      // Long option: payoff = intrinsic - premium; short: premium - intrinsic.
      pnl += (dir * intrinsic - dir * leg.premium) * qty
    }
  }
  return pnl
}

export interface PayoffPoint {
  price: number
  pnl: number
}

export interface StrategyMetrics {
  /** Net debit (negative) or credit (positive) at entry, in dollars. */
  netCashflow: number
  /** Sampled payoff curve. */
  curve: PayoffPoint[]
  /** Max profit in dollars, or null when unbounded. */
  maxProfit: number | null
  /** Max loss in dollars (negative), or null when unbounded. */
  maxLoss: number | null
  /** Underlying prices where P/L crosses zero. */
  breakevens: number[]
}

/**
 * Build a payoff curve and summary metrics for a strategy.
 * `priceRange` defaults to a band around the relevant strikes/spot.
 */
export function strategyMetrics(
  legs: StrategyLeg[],
  opts: { spot?: number; samples?: number; lo?: number; hi?: number } = {},
): StrategyMetrics {
  const strikes = legs.map(l => l.strike).filter((s): s is number => typeof s === 'number' && s > 0)
  const anchors = [...strikes, ...(opts.spot ? [opts.spot] : [])]
  const baseHi = anchors.length ? Math.max(...anchors) : opts.spot || 100
  const baseLo = anchors.length ? Math.min(...anchors) : 0
  const span = Math.max(baseHi - baseLo, baseHi * 0.5, 1)
  const lo = opts.lo ?? Math.max(0, baseLo - span)
  const hi = opts.hi ?? baseHi + span
  const samples = Math.max(opts.samples ?? 121, 11)

  const curve: PayoffPoint[] = []
  for (let s = 0; s < samples; s++) {
    const price = lo + ((hi - lo) * s) / (samples - 1)
    curve.push({ price, pnl: payoffAtPrice(legs, price) })
  }

  // Determine unbounded behaviour from net option deltas at the extremes by
  // probing far out-of-range payoffs.
  const farUp = payoffAtPrice(legs, hi * 4 + 1000)
  const farDown = payoffAtPrice(legs, 0)
  const veryFarUp = payoffAtPrice(legs, hi * 8 + 2000)
  const slopeUp = veryFarUp - farUp
  const profitUnbounded = slopeUp > 1e-6
  const lossUnbounded = slopeUp < -1e-6

  const maxProfit: number | null = profitUnbounded ? null : Math.max(...curve.map(p => p.pnl), farUp, farDown)
  const maxLoss: number | null = lossUnbounded ? null : Math.min(...curve.map(p => p.pnl), farUp, farDown)

  // Breakevens: linear interpolation across sign changes on a fine grid.
  const fineSamples = 2000
  const breakevens: number[] = []
  let prevPrice = lo
  let prevPnl = payoffAtPrice(legs, lo)
  for (let s = 1; s <= fineSamples; s++) {
    const price = lo + ((hi - lo) * s) / fineSamples
    const pnl = payoffAtPrice(legs, price)
    if (prevPnl === 0) {
      breakevens.push(prevPrice)
    } else if (prevPnl < 0 !== pnl < 0 && pnl !== 0) {
      const t = prevPnl / (prevPnl - pnl)
      breakevens.push(prevPrice + t * (price - prevPrice))
    }
    prevPrice = price
    prevPnl = pnl
  }

  // Dedupe near-identical breakevens.
  const deduped: number[] = []
  for (const b of breakevens) {
    if (!deduped.some(d => Math.abs(d - b) < (hi - lo) / fineSamples + 1e-9)) deduped.push(b)
  }

  return {
    netCashflow: netEntryCashflow(legs),
    curve,
    maxProfit,
    maxLoss,
    breakevens: deduped,
  }
}

/** Year-fraction between now and an ISO expiry date (YYYY-MM-DD). */
export function yearsToExpiry(expiration: string, now: Date = new Date()): number {
  const exp = new Date(`${expiration}T20:00:00Z`)
  const ms = exp.getTime() - now.getTime()
  return ms > 0 ? ms / (365 * 24 * 60 * 60 * 1000) : 0
}

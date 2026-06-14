/**
 * Unit tests for the Black–Scholes / strategy-payoff math used by the Options
 * tab and /api/options. Reference values are computed from the standard
 * Black–Scholes formulas (Hull) and put–call parity, so a regression here
 * means the pricing/Greeks have genuinely drifted.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normCdf,
  blackScholesPrice,
  blackScholesGreeks,
  impliedVolatility,
  payoffAtPrice,
  netEntryCashflow,
  strategyMetrics,
  yearsToExpiry,
  type StrategyLeg,
} from '../options-math.ts'

const approx = (a: number, b: number, tol = 1e-3) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b} (tol ${tol})`)

// ─── normCdf ────────────────────────────────────────────────────────────────

test('normCdf: known reference points', () => {
  approx(normCdf(0), 0.5, 1e-6)
  approx(normCdf(1), 0.8413447, 1e-5)
  approx(normCdf(-1), 0.1586553, 1e-5)
  approx(normCdf(1.96), 0.9750021, 1e-5)
})

// ─── blackScholesPrice ──────────────────────────────────────────────────────

test('blackScholesPrice: ATM call reference (S=K=100, T=1, r=5%, vol=20%)', () => {
  const price = blackScholesPrice('call', {
    spot: 100, strike: 100, timeToExpiry: 1, rate: 0.05, volatility: 0.2,
  })
  // Hull reference ≈ 10.4506.
  approx(price, 10.4506, 1e-3)
})

test('blackScholesPrice: put–call parity holds', () => {
  const i = { spot: 100, strike: 95, timeToExpiry: 0.5, rate: 0.04, volatility: 0.3 }
  const call = blackScholesPrice('call', i)
  const put = blackScholesPrice('put', i)
  // C - P = S - K·e^(-rT)
  const parity = i.spot - i.strike * Math.exp(-i.rate * i.timeToExpiry)
  approx(call - put, parity, 1e-6)
})

test('blackScholesPrice: degenerate inputs return intrinsic, never NaN', () => {
  const expired = blackScholesPrice('call', { spot: 120, strike: 100, timeToExpiry: 0, rate: 0.05, volatility: 0.2 })
  approx(expired, 20, 1e-9)
  const zeroVol = blackScholesPrice('put', { spot: 90, strike: 100, timeToExpiry: 0.5, rate: 0.05, volatility: 0 })
  approx(zeroVol, 10, 1e-9)
})

// ─── blackScholesGreeks ─────────────────────────────────────────────────────

test('blackScholesGreeks: ATM call delta near 0.6, put delta = call delta - e^{-qT}', () => {
  const i = { spot: 100, strike: 100, timeToExpiry: 1, rate: 0.05, volatility: 0.2 }
  const call = blackScholesGreeks('call', i)
  const put = blackScholesGreeks('put', i)
  approx(call.delta, 0.6368, 1e-3)
  // For q=0, putDelta = callDelta - 1.
  approx(put.delta, call.delta - 1, 1e-6)
  // Gamma identical for calls and puts.
  approx(call.gamma, put.gamma, 1e-9)
  // Vega identical and positive.
  approx(call.vega, put.vega, 1e-9)
  assert.ok(call.vega > 0)
  // Theta is negative for a long ATM option.
  assert.ok(call.theta < 0)
})

test('blackScholesGreeks: vega scaled per +1 vol point', () => {
  const i = { spot: 100, strike: 100, timeToExpiry: 1, rate: 0.05, volatility: 0.2 }
  const g = blackScholesGreeks('call', i)
  // Raw vega ≈ 37.52 → per 1% ≈ 0.3752.
  approx(g.vega, 0.3752, 1e-3)
})

// ─── impliedVolatility ──────────────────────────────────────────────────────

test('impliedVolatility: round-trips a priced option', () => {
  const i = { spot: 100, strike: 105, timeToExpiry: 0.5, rate: 0.03, volatility: 0.35 }
  const price = blackScholesPrice('call', i)
  const iv = impliedVolatility('call', price, {
    spot: i.spot, strike: i.strike, timeToExpiry: i.timeToExpiry, rate: i.rate,
  })
  assert.ok(iv != null)
  approx(iv!, 0.35, 1e-4)
})

test('impliedVolatility: returns null below intrinsic floor', () => {
  const iv = impliedVolatility('call', 0.01, { spot: 150, strike: 100, timeToExpiry: 1, rate: 0.05 })
  assert.equal(iv, null)
})

// ─── payoff math ────────────────────────────────────────────────────────────

test('payoffAtPrice: long call P/L at expiry', () => {
  const legs: StrategyLeg[] = [{ kind: 'call', side: 'long', strike: 100, premium: 5, quantity: 1 }]
  // Below strike → lose premium (×100).
  approx(payoffAtPrice(legs, 90), -500, 1e-9)
  // At breakeven 105 → 0.
  approx(payoffAtPrice(legs, 105), 0, 1e-9)
  // Above → linear gain.
  approx(payoffAtPrice(legs, 120), 1500, 1e-9)
})

test('netEntryCashflow: debit negative, credit positive', () => {
  const debit: StrategyLeg[] = [{ kind: 'call', side: 'long', strike: 100, premium: 5, quantity: 1 }]
  approx(netEntryCashflow(debit), -500, 1e-9)
  const credit: StrategyLeg[] = [{ kind: 'put', side: 'short', strike: 100, premium: 3, quantity: 2 }]
  approx(netEntryCashflow(credit), 600, 1e-9)
})

test('strategyMetrics: bull call spread has bounded profit/loss and one breakeven', () => {
  // Long 100 call @5, short 110 call @2 → net debit 3.
  const legs: StrategyLeg[] = [
    { kind: 'call', side: 'long', strike: 100, premium: 5, quantity: 1 },
    { kind: 'call', side: 'short', strike: 110, premium: 2, quantity: 1 },
  ]
  const m = strategyMetrics(legs, { spot: 100 })
  approx(m.netCashflow, -300, 1e-9)
  assert.ok(m.maxProfit != null && m.maxLoss != null, 'spread is bounded both ways')
  // Max profit = (10 spread - 3 debit) ×100 = 700; max loss = -300.
  approx(m.maxProfit!, 700, 1)
  approx(m.maxLoss!, -300, 1)
  assert.equal(m.breakevens.length, 1)
  approx(m.breakevens[0], 103, 0.1)
})

test('strategyMetrics: long straddle is loss-bounded, profit-unbounded, two breakevens', () => {
  const legs: StrategyLeg[] = [
    { kind: 'call', side: 'long', strike: 100, premium: 4, quantity: 1 },
    { kind: 'put', side: 'long', strike: 100, premium: 4, quantity: 1 },
  ]
  const m = strategyMetrics(legs, { spot: 100 })
  assert.equal(m.maxProfit, null, 'straddle profit unbounded')
  assert.ok(m.maxLoss != null)
  approx(m.maxLoss!, -800, 1)
  assert.equal(m.breakevens.length, 2)
  approx(m.breakevens[0], 92, 0.2)
  approx(m.breakevens[1], 108, 0.2)
})

test('strategyMetrics: covered call caps upside', () => {
  // Long 100 shares @100, short 110 call @3.
  const legs: StrategyLeg[] = [
    { kind: 'stock', side: 'long', premium: 100, quantity: 100 },
    { kind: 'call', side: 'short', strike: 110, premium: 3, quantity: 1 },
  ]
  const m = strategyMetrics(legs, { spot: 100 })
  assert.ok(m.maxProfit != null, 'covered call profit is capped')
  // Max profit = (110-100)×100 + 3×100 = 1300.
  approx(m.maxProfit!, 1300, 5)
  // Breakeven = 100 - 3 = 97.
  assert.equal(m.breakevens.length, 1)
  approx(m.breakevens[0], 97, 0.2)
})

// ─── yearsToExpiry ──────────────────────────────────────────────────────────

test('yearsToExpiry: ~30 days ≈ 0.082y, past dates clamp to 0', () => {
  const now = new Date('2026-01-01T12:00:00Z')
  const y = yearsToExpiry('2026-01-31', now)
  approx(y, 30 / 365, 5e-3)
  assert.equal(yearsToExpiry('2025-01-01', now), 0)
})

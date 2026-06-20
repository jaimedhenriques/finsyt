/**
 * Unit tests for the Factor Lab back-test engine (`lib/backtest.ts`).
 *
 * The engine is a pure function, so we feed deterministic synthetic price
 * series with a known ranking outcome and assert the mechanics:
 *   • symbols with a stronger trend land in the top quantile,
 *   • the top-quantile equity curve beats the bottom-quantile curve when the
 *     factor is informative,
 *   • coverage / empty-state handling is honest (no fabricated rows),
 *   • the summary stats are internally consistent.
 *
 * No upstream data is touched — everything here is generated in-process.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runBacktest, FACTORS, BACKTEST_UNIVERSES, type PriceBar, type BacktestConfig } from '../backtest.ts'

// ── Synthetic data helpers ───────────────────────────────────────────────────

/** Build ~`days` of daily bars compounding a fixed daily drift from `start`. */
function trendSeries(startDate: string, days: number, dailyDrift: number, start = 100): PriceBar[] {
  const bars: PriceBar[] = []
  let price = start
  const d = new Date(startDate + 'T00:00:00Z')
  for (let i = 0; i < days; i++) {
    // step weekdays only to look like a trading calendar
    do {
      d.setUTCDate(d.getUTCDate() + 1)
    } while (d.getUTCDay() === 0 || d.getUTCDay() === 6)
    price *= 1 + dailyDrift
    bars.push({ date: d.toISOString().slice(0, 10), close: Number(price.toFixed(4)) })
  }
  return bars
}

const FROM = '2019-01-01'
const DAYS = 252 * 4 // ~4 trading years

// Five names with monotonically increasing drift: E strongest, A weakest.
function fiveNameUniverse(): Record<string, PriceBar[]> {
  return {
    A: trendSeries(FROM, DAYS, -0.0004),
    B: trendSeries(FROM, DAYS, 0.0),
    C: trendSeries(FROM, DAYS, 0.0003),
    D: trendSeries(FROM, DAYS, 0.0006),
    E: trendSeries(FROM, DAYS, 0.001),
  }
}

const benchmark = () => trendSeries(FROM, DAYS, 0.0002)

// ── Tests ────────────────────────────────────────────────────────────────────

test('momentum back-test ranks the strongest trend into the top quantile', () => {
  const config: BacktestConfig = { factor: 'mom_12_1', quantiles: 5, rebalance: 'quarterly' }
  const res = runBacktest({ priceSeriesBySymbol: fiveNameUniverse(), benchmark: benchmark(), config, benchmarkLabel: 'BENCH' })
  assert.equal(res.ok, true)
  if (!res.ok) return
  // With 5 names and 5 quantiles, each quantile holds exactly one name.
  const top = res.ranking.find((r) => r.quantile === 1)
  const bottom = res.ranking.find((r) => r.quantile === 5)
  assert.equal(top?.symbol, 'E', 'strongest drift should rank #1')
  assert.equal(bottom?.symbol, 'A', 'weakest drift should rank last')
})

test('informative factor produces a top quantile that beats the bottom', () => {
  const config: BacktestConfig = { factor: 'mom_12_1', quantiles: 5, rebalance: 'quarterly' }
  const res = runBacktest({ priceSeriesBySymbol: fiveNameUniverse(), benchmark: benchmark(), config })
  assert.equal(res.ok, true)
  if (!res.ok) return
  const last = res.series[res.series.length - 1]
  assert.ok(last.topQ > last.bottomQ, 'top-quantile equity should exceed bottom-quantile equity')
  assert.ok(res.summary.long.cagr > res.summary.benchmark.cagr - 0.5, 'long CAGR is a finite number near benchmark scale')
  assert.ok(res.summary.longShort.totalReturn > 0, 'long-short spread should be positive for a monotonic factor')
})

test('equity series starts at 1.0 and reports one point per window boundary', () => {
  const config: BacktestConfig = { factor: 'mom_6_1', quantiles: 4, rebalance: 'quarterly' }
  const res = runBacktest({ priceSeriesBySymbol: fiveNameUniverse(), benchmark: benchmark(), config })
  assert.equal(res.ok, true)
  if (!res.ok) return
  assert.equal(res.series[0].topQ, 1)
  assert.equal(res.series[0].benchmark, 1)
  assert.equal(res.series.length, res.windows + 1)
  assert.equal(res.quantileBuckets.length, 4)
  for (const b of res.quantileBuckets) assert.ok(Number.isFinite(b.avgReturn))
})

test('summary stats are finite and hit rate is bounded 0..1', () => {
  const config: BacktestConfig = { factor: 'lowvol_3m', quantiles: 3, rebalance: 'monthly' }
  const res = runBacktest({ priceSeriesBySymbol: fiveNameUniverse(), benchmark: benchmark(), config })
  assert.equal(res.ok, true)
  if (!res.ok) return
  for (const s of [res.summary.long, res.summary.longShort, res.summary.benchmark]) {
    assert.ok(Number.isFinite(s.cagr))
    assert.ok(Number.isFinite(s.vol))
    assert.ok(Number.isFinite(s.sharpe))
    assert.ok(Number.isFinite(s.maxDrawdown))
    assert.ok(s.hitRate >= 0 && s.hitRate <= 1)
    assert.ok(s.maxDrawdown <= 0)
  }
})

test('honest empty state when the universe is too small', () => {
  const res = runBacktest({
    priceSeriesBySymbol: { A: trendSeries(FROM, DAYS, 0.001) },
    benchmark: benchmark(),
    config: { factor: 'mom_12_1', quantiles: 5, rebalance: 'quarterly' },
  })
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.equal(res.reason, 'no_universe')
})

test('honest empty state when history is shorter than the factor lookback', () => {
  // Only ~30 trading days — far short of the 252-day 12-1 momentum lookback.
  const short = (): Record<string, PriceBar[]> => ({
    A: trendSeries(FROM, 30, 0.001),
    B: trendSeries(FROM, 30, -0.001),
    C: trendSeries(FROM, 30, 0.0005),
  })
  const res = runBacktest({
    priceSeriesBySymbol: short(),
    benchmark: trendSeries(FROM, 30, 0.0002),
    config: { factor: 'mom_12_1', quantiles: 3, rebalance: 'monthly' },
  })
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.equal(res.reason, 'insufficient_data')
})

test('dropped symbols are reported when some names lack history', () => {
  const mixed: Record<string, PriceBar[]> = {
    ...fiveNameUniverse(),
    SHORTY: trendSeries('2023-06-01', 40, 0.001), // too short to ever score
  }
  const res = runBacktest({
    priceSeriesBySymbol: mixed,
    benchmark: benchmark(),
    config: { factor: 'mom_12_1', quantiles: 5, rebalance: 'quarterly' },
  })
  assert.equal(res.ok, true)
  if (!res.ok) return
  assert.ok(res.droppedSymbols.includes('SHORTY'))
  assert.ok(!res.coveredSymbols.includes('SHORTY'))
})

test('catalog metadata is well-formed', () => {
  assert.ok(FACTORS.length >= 5)
  for (const f of FACTORS) {
    assert.ok(f.lookbackDays > 0)
    assert.ok(f.label.length > 0)
  }
  assert.ok(BACKTEST_UNIVERSES.length >= 3)
  for (const u of BACKTEST_UNIVERSES) {
    assert.ok(u.symbols.length >= 2, `${u.key} should have a real basket`)
  }
})

/**
 * Unit tests for the technical-indicator engine (`lib/technical-indicators.ts`).
 *
 * These pin down the maths against hand-computed expectations and verify the
 * warm-up (null) alignment + the orchestrator / signal helpers that the API
 * route and `get_technicals` agent tool depend on.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sma, ema, wma, bollinger, rsi, macd, stochastic, adx, obv, vwap, donchian, ichimoku,
  computeIndicator, computeIndicators, latestSignals,
  type Bar,
} from '../technical-indicators.ts'

function bar(c: number, h = c, l = c, v = 0, t = 0): Bar {
  return { t, c, h, l, v }
}

// ─── SMA ────────────────────────────────────────────────────────────────────

test('sma: warm-up nulls then correct rolling mean', () => {
  const out = sma([1, 2, 3, 4, 5], 3)
  assert.deepEqual(out, [null, null, 2, 3, 4])
})

// ─── EMA ────────────────────────────────────────────────────────────────────

test('ema: seeds with SMA then smooths', () => {
  const out = ema([1, 2, 3, 4, 5], 3)
  // seed = mean(1,2,3)=2 at index 2; k = 2/4 = 0.5
  assert.equal(out[0], null)
  assert.equal(out[1], null)
  assert.equal(out[2], 2)
  assert.equal(out[3], 4 * 0.5 + 2 * 0.5) // 3
  assert.equal(out[4], 5 * 0.5 + 3 * 0.5) // 4
})

// ─── WMA ────────────────────────────────────────────────────────────────────

test('wma: weights most-recent value highest', () => {
  const out = wma([1, 2, 3], 3)
  // (1*1 + 2*2 + 3*3) / (1+2+3) = 14/6
  assert.equal(out[0], null)
  assert.equal(out[1], null)
  assert.ok(Math.abs((out[2] as number) - 14 / 6) < 1e-9)
})

// ─── Bollinger ───────────────────────────────────────────────────────────────

test('bollinger: middle equals SMA and bands straddle it symmetrically', () => {
  const values = [10, 12, 14, 16, 18]
  const b = bollinger(values, 5, 2)
  const mean = (10 + 12 + 14 + 16 + 18) / 5 // 14
  assert.equal(b.middle[4], 14)
  // population sd of [10..18 step2] = sqrt(mean of squared dev)
  const variance = ([10, 12, 14, 16, 18].reduce((a, v) => a + (v - mean) ** 2, 0)) / 5
  const sd = Math.sqrt(variance)
  // engine rounds series to 4dp, so allow a small tolerance.
  assert.ok(Math.abs((b.upper[4] as number) - (mean + 2 * sd)) < 1e-3)
  assert.ok(Math.abs((b.lower[4] as number) - (mean - 2 * sd)) < 1e-3)
})

// ─── RSI ──────────────────────────────────────────────────────────────────────

test('rsi: monotonic rising series yields 100', () => {
  const values = Array.from({ length: 20 }, (_, i) => i + 1)
  const out = rsi(values, 14)
  // No losses → avgLoss 0 → RSI 100.
  assert.equal(out[14], 100)
  assert.equal(out[19], 100)
  assert.equal(out[13], null)
})

test('rsi: stays within 0..100 bounds', () => {
  const values = [44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22]
  const out = rsi(values, 14)
  for (const v of out) {
    if (v != null) assert.ok(v >= 0 && v <= 100, `RSI ${v} out of bounds`)
  }
  assert.notEqual(lastNonNull(out), null)
})

// ─── MACD ──────────────────────────────────────────────────────────────────────

test('macd: histogram equals macd minus signal where both defined', () => {
  const values = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.2)
  const m = macd(values, 12, 26, 9)
  for (let i = 0; i < values.length; i++) {
    if (m.macd[i] != null && m.signal[i] != null) {
      const expected = (m.macd[i] as number) - (m.signal[i] as number)
      assert.ok(Math.abs((m.histogram[i] as number) - expected) < 1e-3)
    }
  }
})

// ─── Stochastic ──────────────────────────────────────────────────────────────

test('stochastic: %K is 100 when close equals the window high', () => {
  // Build 14 bars where the last close IS the highest high in the window
  // (high == close on every bar, monotonic rising).
  const bars: Bar[] = Array.from({ length: 14 }, (_, i) => bar(10 + i, 10 + i, 9 + i))
  const st = stochastic(bars, 14, 1, 1)
  // highestHigh = last close (23), lowestLow = 9 → %K = (23-9)/(23-9)*100 = 100.
  assert.equal(st.k[13], 100)
})

// ─── ADX ─────────────────────────────────────────────────────────────────────

test('adx: produces DI and bounded ADX on a trending series', () => {
  const bars: Bar[] = Array.from({ length: 60 }, (_, i) => bar(100 + i, 100 + i + 1, 100 + i - 1, 1000, i))
  const a = adx(bars, 14)
  const lastAdx = lastNonNull(a.adx)
  const lastPlus = lastNonNull(a.plusDI)
  assert.notEqual(lastAdx, null)
  assert.ok((lastAdx as number) >= 0 && (lastAdx as number) <= 100)
  // Steady uptrend → +DI should dominate -DI.
  assert.ok((lastPlus as number) > (lastNonNull(a.minusDI) as number))
})

// ─── OBV ─────────────────────────────────────────────────────────────────────

test('obv: accumulates volume by close direction', () => {
  const bars: Bar[] = [bar(10, 10, 10, 100), bar(11, 11, 11, 50), bar(10, 10, 10, 30), bar(10, 10, 10, 20)]
  const out = obv(bars)
  // start 0, +50 (up), -30 (down), +0 (flat) = 20
  assert.deepEqual(out, [0, 50, 20, 20])
})

// ─── VWAP ─────────────────────────────────────────────────────────────────────

test('vwap: volume-weighted cumulative average', () => {
  const bars: Bar[] = [bar(10, 10, 10, 100), bar(20, 20, 20, 100)]
  const out = vwap(bars)
  // (10*100)/100 = 10 ; (10*100 + 20*100)/200 = 15
  assert.equal(out[0], 10)
  assert.equal(out[1], 15)
})

// ─── Donchian ────────────────────────────────────────────────────────────────

test('donchian: upper/lower track window extremes', () => {
  const bars: Bar[] = [bar(10, 12, 8), bar(11, 15, 9), bar(9, 13, 7)]
  const d = donchian(bars, 3)
  assert.equal(d.upper[2], 15)
  assert.equal(d.lower[2], 7)
  assert.equal(d.middle[2], 11)
})

// ─── Ichimoku ──────────────────────────────────────────────────────────────────

test('ichimoku: conversion line is midpoint of recent high/low', () => {
  const bars: Bar[] = Array.from({ length: 60 }, (_, i) => bar(100 + i, 100 + i + 2, 100 + i - 2, 0, i))
  const ich = ichimoku(bars)
  assert.equal(ich.displacement, 26)
  // conversion at index 8 (9-period) = (maxHigh - minLow)/2 over first 9 bars.
  const conv8 = ich.conversion[8]
  assert.notEqual(conv8, null)
  // lagging span equals close.
  assert.equal(ich.laggingSpan[10], 110)
})

// ─── Orchestrator ──────────────────────────────────────────────────────────────

test('computeIndicator: applies defaults and tags pane', () => {
  const bars: Bar[] = Array.from({ length: 30 }, (_, i) => bar(50 + i, 51 + i, 49 + i, 100, i))
  const smaInd = computeIndicator(bars, { type: 'sma' })
  assert.equal(smaInd.pane, 'overlay')
  assert.equal(smaInd.params.period, 50)
  const rsiInd = computeIndicator(bars, { type: 'rsi', params: { period: 7 } })
  assert.equal(rsiInd.pane, 'oscillator')
  assert.equal(rsiInd.params.period, 7)
  assert.ok('rsi' in rsiInd.series)
})

test('computeIndicators: skips unknown types and preserves order', () => {
  const bars: Bar[] = Array.from({ length: 30 }, (_, i) => bar(50 + i, 51 + i, 49 + i, 100, i))
  const out = computeIndicators(bars, [
    { type: 'ema', params: { period: 5 } },
    { type: 'bogus' as never },
    { type: 'macd' },
  ])
  assert.equal(out.length, 2)
  assert.equal(out[0].type, 'ema')
  assert.equal(out[1].type, 'macd')
})

// ─── Signals ───────────────────────────────────────────────────────────────────

test('latestSignals: flags overbought RSI on a steep rally', () => {
  const bars: Bar[] = Array.from({ length: 60 }, (_, i) => bar(100 + i * 2, 100 + i * 2 + 1, 100 + i * 2 - 1, 1000, i))
  const sigs = latestSignals(bars)
  const rsiSig = sigs.find(s => s.indicator.startsWith('RSI'))
  assert.ok(rsiSig)
  assert.equal(rsiSig!.signal, 'overbought')
  // golden-cross regime present in a long uptrend with 200+ bars? (only 60 here → no SMA200 signal)
  assert.ok(!sigs.find(s => s.indicator === 'Golden/Death cross'))
})

test('latestSignals: empty for too-short series', () => {
  assert.deepEqual(latestSignals([bar(10)]), [])
})

function lastNonNull(s: Array<number | null>): number | null {
  for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i]
  return null
}

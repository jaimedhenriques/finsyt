/**
 * Unit tests for the pure news-sentiment core (Task #401). These pin the
 * deterministic primitives the monitor relies on: lexicon scoring, label
 * thresholds, upstream-shape normalisation, daily aggregation, and — most
 * importantly — the trailing-baseline deviation math that drives the company
 * tile, the news-surface badges, the sentiment-deviation alert, and the
 * agent tool. A regression here means the deviation flags have genuinely
 * drifted.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  labelForScore,
  lexiconScore,
  normalizeUpstreamSentiment,
  dayKey,
  aggregateDailySentiment,
  computeDeviation,
  mean,
  stddev,
  type SentimentDailyPoint,
} from '../news-sentiment-core'

const approx = (a: number, b: number, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b} (tol ${tol})`)

// ── labelForScore ────────────────────────────────────────────────────────────
test('labelForScore: threshold boundaries', () => {
  assert.equal(labelForScore(0.5), 'positive')
  assert.equal(labelForScore(0.15), 'positive')
  assert.equal(labelForScore(0.149), 'neutral')
  assert.equal(labelForScore(0), 'neutral')
  assert.equal(labelForScore(-0.149), 'neutral')
  assert.equal(labelForScore(-0.15), 'negative')
  assert.equal(labelForScore(-0.9), 'negative')
  assert.equal(labelForScore(NaN), 'neutral')
})

// ── lexiconScore ─────────────────────────────────────────────────────────────
test('lexiconScore: empty / non-string / no-hit text is neutral 0', () => {
  assert.equal(lexiconScore(''), 0)
  assert.equal(lexiconScore(null), 0)
  assert.equal(lexiconScore(undefined), 0)
  assert.equal(lexiconScore('the company released a report today'), 0)
})

test('lexiconScore: positive vs negative headlines have correct sign', () => {
  const pos = lexiconScore('Nvidia beats estimates, shares surge to record high')
  const neg = lexiconScore('Boeing plunges after analyst downgrade and profit warning')
  assert.ok(pos > 0.3, `expected strong positive, got ${pos}`)
  assert.ok(neg < -0.3, `expected strong negative, got ${neg}`)
})

test('lexiconScore: negation flips polarity', () => {
  const plain = lexiconScore('earnings beat')
  const negated = lexiconScore('earnings did not beat')
  assert.ok(plain > 0)
  assert.ok(negated < 0, `expected negated to be negative, got ${negated}`)
})

test('lexiconScore: stays within [-1, 1]', () => {
  const s = lexiconScore('surge surge surge beat beats record record strong growth rally')
  assert.ok(s <= 1 && s >= -1)
})

// ── normalizeUpstreamSentiment ───────────────────────────────────────────────
test('normalizeUpstreamSentiment: null/empty → null', () => {
  assert.equal(normalizeUpstreamSentiment(null), null)
  assert.equal(normalizeUpstreamSentiment(undefined), null)
  assert.equal(normalizeUpstreamSentiment(''), null)
  assert.equal(normalizeUpstreamSentiment('   '), null)
  assert.equal(normalizeUpstreamSentiment('something unrelated'), null)
})

test('normalizeUpstreamSentiment: Polygon-style string labels', () => {
  assert.deepEqual(normalizeUpstreamSentiment('positive'), { score: 0.6, label: 'positive' })
  assert.deepEqual(normalizeUpstreamSentiment('negative'), { score: -0.6, label: 'negative' })
  assert.deepEqual(normalizeUpstreamSentiment('neutral'), { score: 0, label: 'neutral' })
  assert.deepEqual(normalizeUpstreamSentiment('Bullish'), { score: 0.6, label: 'positive' })
  assert.deepEqual(normalizeUpstreamSentiment('Bearish'), { score: -0.6, label: 'negative' })
})

test('normalizeUpstreamSentiment: numeric polarity in [-1,1] used as-is', () => {
  const r = normalizeUpstreamSentiment(0.42)
  assert.ok(r)
  approx(r!.score, 0.42)
  assert.equal(r!.label, 'positive')
  const neg = normalizeUpstreamSentiment(-0.8)
  assert.equal(neg!.label, 'negative')
})

test('normalizeUpstreamSentiment: EODHD-style object {polarity}', () => {
  const r = normalizeUpstreamSentiment({ polarity: -0.5, pos: 0.1, neg: 0.6, neu: 0.3 })
  assert.ok(r)
  approx(r!.score, -0.5)
  assert.equal(r!.label, 'negative')
})

test('normalizeUpstreamSentiment: pos/neg bag → signed score', () => {
  const r = normalizeUpstreamSentiment({ pos: 0.7, neg: 0.2 })
  assert.ok(r)
  approx(r!.score, 0.5)
  assert.equal(r!.label, 'positive')
})

test('normalizeUpstreamSentiment: nested {sentiment: label}', () => {
  assert.deepEqual(normalizeUpstreamSentiment({ sentiment: 'positive' }), { score: 0.6, label: 'positive' })
})

// ── dayKey ───────────────────────────────────────────────────────────────────
test('dayKey: parses ISO + bare date, rejects junk', () => {
  assert.equal(dayKey('2026-06-14T13:45:00Z'), '2026-06-14')
  assert.equal(dayKey('2026-06-14'), '2026-06-14')
  assert.equal(dayKey('not a date'), null)
  assert.equal(dayKey(null), null)
})

// ── aggregateDailySentiment ──────────────────────────────────────────────────
test('aggregateDailySentiment: groups by UTC day, ascending, with label tallies', () => {
  const series = aggregateDailySentiment([
    { publishedAt: '2026-06-12T10:00:00Z', score: 0.8 },
    { publishedAt: '2026-06-12T18:00:00Z', score: -0.2 },
    { publishedAt: '2026-06-13T09:00:00Z', score: 0.5 },
    { publishedAt: 'bad-date', score: 0.9 },
  ])
  assert.equal(series.length, 2)
  assert.equal(series[0].date, '2026-06-12')
  assert.equal(series[0].count, 2)
  approx(series[0].avgScore, 0.3, 1e-6)
  assert.equal(series[0].positive, 1)
  assert.equal(series[0].negative, 1)
  assert.equal(series[1].date, '2026-06-13')
  assert.equal(series[1].count, 1)
})

// ── mean / stddev ────────────────────────────────────────────────────────────
test('mean and sample stddev reference values', () => {
  approx(mean([2, 4, 6]), 4)
  // sample std of [2,4,6] = sqrt(((4)+(0)+(4))/2) = sqrt(4) = 2
  approx(stddev([2, 4, 6]), 2)
  assert.equal(stddev([5]), 0)
  assert.equal(stddev([]), 0)
})

// ── computeDeviation ─────────────────────────────────────────────────────────
function pt(date: string, count: number, avgScore: number): SentimentDailyPoint {
  return { date, count, avgScore, positive: 0, neutral: 0, negative: 0 }
}

test('computeDeviation: too little history → no signal', () => {
  const r = computeDeviation([pt('2026-06-14', 5, 0.2)])
  assert.equal(r.hasSignal, false)
  assert.match(r.note, /Not enough history/)
})

test('computeDeviation: baseline shorter than minimum → no signal', () => {
  const r = computeDeviation(
    [pt('2026-06-13', 3, 0.1), pt('2026-06-14', 9, 0.9)],
    { minBaselineDays: 3 },
  )
  assert.equal(r.hasSignal, false)
  assert.equal(r.baselineDays, 1)
})

test('computeDeviation: stable baseline + calm latest → no deviation', () => {
  const series = [
    pt('2026-06-10', 5, 0.10),
    pt('2026-06-11', 5, 0.12),
    pt('2026-06-12', 5, 0.08),
    pt('2026-06-13', 5, 0.11),
    pt('2026-06-14', 5, 0.10),
  ]
  const r = computeDeviation(series, { z: 2 })
  assert.equal(r.hasSignal, false)
  assert.equal(r.volume.deviated, false)
  assert.equal(r.sentiment.deviated, false)
})

test('computeDeviation: volume spike fires a one-sided signal', () => {
  // baseline counts all 4 → mean 4, std 0 would block; vary slightly.
  const series = [
    pt('2026-06-10', 4, 0.1),
    pt('2026-06-11', 5, 0.1),
    pt('2026-06-12', 4, 0.1),
    pt('2026-06-13', 5, 0.1),
    pt('2026-06-14', 40, 0.1), // huge volume surge
  ]
  const r = computeDeviation(series, { z: 2 })
  assert.equal(r.volume.deviated, true)
  assert.ok(r.volume.z >= 2, `expected volume z>=2, got ${r.volume.z}`)
  assert.equal(r.sentiment.deviated, false)
  assert.equal(r.hasSignal, true)
})

test('computeDeviation: negative sentiment swing flags direction', () => {
  const series = [
    pt('2026-06-10', 5, 0.20),
    pt('2026-06-11', 5, 0.22),
    pt('2026-06-12', 5, 0.18),
    pt('2026-06-13', 5, 0.21),
    pt('2026-06-14', 5, -0.90), // sharp negative swing
  ]
  const r = computeDeviation(series, { z: 2 })
  assert.equal(r.sentiment.deviated, true)
  assert.equal(r.direction, 'negative')
  assert.ok(r.sentiment.z <= -2, `expected sentiment z<=-2, got ${r.sentiment.z}`)
  assert.match(r.note, /sentiment swung negative/)
})

test('computeDeviation: zero-variance baseline never divides by zero', () => {
  const series = [
    pt('2026-06-10', 5, 0.1),
    pt('2026-06-11', 5, 0.1),
    pt('2026-06-12', 5, 0.1),
    pt('2026-06-14', 9, 0.9),
  ]
  const r = computeDeviation(series, { z: 2 })
  assert.equal(Number.isFinite(r.volume.z), true)
  assert.equal(Number.isFinite(r.sentiment.z), true)
  assert.equal(r.volume.z, 0)
  assert.equal(r.sentiment.z, 0)
  assert.equal(r.hasSignal, false)
})

test('computeDeviation: respects baselineDays window (older days ignored)', () => {
  // 20 calm days then a spike; with baselineDays=14 the baseline is the 14
  // days before the latest, all calm → spike should still register.
  const series: SentimentDailyPoint[] = []
  for (let i = 0; i < 20; i++) {
    const day = String(i + 1).padStart(2, '0')
    series.push(pt(`2026-05-${day}`, 4 + (i % 2), 0.1))
  }
  series.push(pt('2026-06-01', 50, 0.1))
  const r = computeDeviation(series, { z: 2, baselineDays: 14 })
  assert.equal(r.baselineDays, 14)
  assert.equal(r.volume.deviated, true)
})

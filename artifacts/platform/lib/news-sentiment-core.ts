/**
 * News-sentiment core — pure, dependency-free building blocks for the
 * News Sentiment Monitor (Task #401). Kept side-effect-free so the
 * aggregation + deviation math can be exhaustively unit-tested without a
 * network, an LLM, or a database. The LLM scorer and caching layer live in
 * `news-sentiment.ts`; this file holds only the deterministic primitives:
 *
 *   - a lightweight finance-tuned lexicon scorer (cheap fallback / news-feed
 *     badge source, no LLM call),
 *   - a normaliser that maps the many upstream sentiment shapes (Polygon
 *     insights, EODHD polarity, Finnhub/FinanceFlow labels, …) onto one
 *     [-1, 1] score,
 *   - per-day aggregation of scored articles into a sentiment + volume
 *     series, and
 *   - trailing-baseline deviation detection (volume spike + sentiment swing
 *     z-scores) that powers the company tile, the news surface badges, the
 *     sentiment-deviation alert monitor, and the agent tool.
 */
import { z } from 'zod'

export type SentimentLabel = 'positive' | 'neutral' | 'negative'

/** Score thresholds that turn a continuous [-1, 1] score into a label. */
export const POSITIVE_THRESHOLD = 0.15
export const NEGATIVE_THRESHOLD = -0.15

export function labelForScore(score: number): SentimentLabel {
  if (!Number.isFinite(score)) return 'neutral'
  if (score >= POSITIVE_THRESHOLD) return 'positive'
  if (score <= NEGATIVE_THRESHOLD) return 'negative'
  return 'neutral'
}

// ── Finance-tuned lexicon ────────────────────────────────────────────────────
// Deliberately small + curated. Each word carries a weight; the scorer sums
// weights over the matched tokens, applies a simple one-token negation flip,
// and squashes the total to [-1, 1]. This is a clean-room heuristic — it is
// NOT meant to rival the LLM scorer, only to give every article a cheap,
// deterministic baseline tone when no LLM/upstream score is available.
const POSITIVE_WORDS: Record<string, number> = {
  beat: 2, beats: 2, surge: 2, surged: 2, surges: 2, soar: 2, soars: 2, soared: 2,
  jump: 1.5, jumps: 1.5, jumped: 1.5, rally: 1.5, rallies: 1.5, rallied: 1.5,
  gain: 1, gains: 1, gained: 1, rise: 1, rises: 1, rose: 1, climb: 1, climbs: 1,
  upgrade: 2, upgraded: 2, upgrades: 2, outperform: 2, outperforms: 2,
  bullish: 2, record: 1.5, strong: 1.5, growth: 1, profit: 1, profits: 1,
  raises: 1.5, raised: 1.5, boost: 1.5, boosted: 1.5, win: 1, wins: 1,
  approval: 1.5, approved: 1.5, breakthrough: 2, expansion: 1, dividend: 0.5,
  optimistic: 1.5, momentum: 1, recovery: 1.5, rebound: 1.5, exceeds: 2, exceeded: 2,
  topped: 1.5, accelerate: 1, accelerates: 1, upbeat: 1.5,
}
const NEGATIVE_WORDS: Record<string, number> = {
  miss: 2, misses: 2, missed: 2, plunge: 2, plunges: 2, plunged: 2, slump: 2, slumps: 2,
  drop: 1.5, drops: 1.5, dropped: 1.5, fall: 1, falls: 1, fell: 1, decline: 1.5, declines: 1.5,
  downgrade: 2, downgraded: 2, downgrades: 2, underperform: 2, underperforms: 2,
  bearish: 2, weak: 1.5, weakness: 1.5, loss: 1.5, losses: 1.5, lawsuit: 1.5, probe: 1.5,
  cut: 1.5, cuts: 1.5, slashed: 2, slash: 2, warning: 1.5, warns: 1.5, warned: 1.5,
  recall: 1.5, fraud: 2.5, investigation: 1.5, bankruptcy: 2.5, default: 2, layoffs: 1.5,
  layoff: 1.5, sinks: 2, sink: 2, sank: 2, tumble: 2, tumbles: 2, tumbled: 2,
  disappointing: 2, disappoints: 2, disappointed: 2, slowdown: 1.5, halt: 1.5, halted: 1.5,
  pessimistic: 1.5, crisis: 2, shortfall: 2,
}
const NEGATORS = new Set(['not', 'no', "n't", 'never', 'without', 'fails', 'fail', 'failed'])

/**
 * Score free text on [-1, 1] using the finance lexicon. Returns 0 for empty
 * text or text with no lexicon hits (→ neutral).
 */
export function lexiconScore(text: string | null | undefined): number {
  if (!text || typeof text !== 'string') return 0
  const tokens = text.toLowerCase().match(/[a-z']+/g)
  if (!tokens || tokens.length === 0) return 0
  let total = 0
  let hits = 0
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    let w = POSITIVE_WORDS[tok] ?? (NEGATIVE_WORDS[tok] != null ? -NEGATIVE_WORDS[tok] : 0)
    if (w === 0) continue
    const prev = tokens[i - 1]
    if (prev && NEGATORS.has(prev)) w = -w
    total += w
    hits += 1
  }
  if (hits === 0) return 0
  // Squash: divide by hits then map through tanh-like compression so a single
  // strong word saturates toward ±1 but never exceeds it.
  const avg = total / hits
  const squashed = Math.tanh(avg / 2)
  return clamp(squashed, -1, 1)
}

// ── Upstream sentiment normalisation ─────────────────────────────────────────
// Upstream providers express sentiment in incompatible shapes:
//   - Polygon (Massive) insights: { sentiment: 'positive' | 'neutral' | 'negative' }
//   - EODHD: { polarity: number in [-1,1], pos, neg, neu } or a bare number
//   - Finnhub / FinanceFlow: 'Bullish' | 'Bearish' | numeric 0..1 / -1..1
// This maps any of them onto one signed [-1, 1] score, or null when there is
// nothing usable (so the caller can fall back to the lexicon / LLM).
export function normalizeUpstreamSentiment(
  raw: unknown,
): { score: number; label: SentimentLabel } | null {
  if (raw == null) return null

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Heuristic: values in [0,1] with no negatives are treated as a positive
    // probability mapped to [-1,1]; values already in [-1,1] are used as-is.
    const score = raw > 1 ? clamp(raw / 100, -1, 1) : clamp(raw, -1, 1)
    return { score, label: labelForScore(score) }
  }

  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase()
    if (!s) return null
    const num = Number(s)
    if (Number.isFinite(num) && /[-\d.]/.test(s) && !/[a-z]/.test(s)) {
      const score = clamp(num, -1, 1)
      return { score, label: labelForScore(score) }
    }
    if (/(bull|positive|buy|upbeat|optimis)/.test(s)) return { score: 0.6, label: 'positive' }
    if (/(bear|negative|sell|pessimis)/.test(s)) return { score: -0.6, label: 'negative' }
    if (/(neutral|hold|mixed)/.test(s)) return { score: 0, label: 'neutral' }
    return null
  }

  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const polarity = o.polarity ?? o.score ?? o.compound ?? o.sentiment_score
    if (typeof polarity === 'number' && Number.isFinite(polarity)) {
      const score = clamp(polarity, -1, 1)
      return { score, label: labelForScore(score) }
    }
    // Pos/neg/neu probability bag → signed score (pos - neg).
    const pos = toNum(o.pos ?? o.positive)
    const neg = toNum(o.neg ?? o.negative)
    if (pos != null || neg != null) {
      const score = clamp((pos ?? 0) - (neg ?? 0), -1, 1)
      return { score, label: labelForScore(score) }
    }
    if (typeof o.sentiment === 'string' || typeof o.label === 'string') {
      return normalizeUpstreamSentiment((o.sentiment ?? o.label) as string)
    }
  }
  return null
}

// ── Aggregation ──────────────────────────────────────────────────────────────
export interface ScoredArticleInput {
  /** ISO date or datetime string. */
  publishedAt: string
  /** Signed sentiment score in [-1, 1]. */
  score: number
}

export interface SentimentDailyPoint {
  /** YYYY-MM-DD (UTC). */
  date: string
  /** Number of articles that day. */
  count: number
  /** Mean signed sentiment that day, [-1, 1]. */
  avgScore: number
  positive: number
  neutral: number
  negative: number
}

/** UTC calendar day (YYYY-MM-DD) for an ISO timestamp; null when unparseable. */
export function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    // Tolerate bare YYYY-MM-DD strings that `new Date` parses fine, plus
    // already-truncated keys.
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(iso))
    return m ? m[1] : null
  }
  return d.toISOString().slice(0, 10)
}

/**
 * Group scored articles into an ascending-by-date series of daily sentiment +
 * volume points. Articles with an unparseable date are dropped.
 */
export function aggregateDailySentiment(articles: ScoredArticleInput[]): SentimentDailyPoint[] {
  const byDay = new Map<string, { sum: number; count: number; pos: number; neu: number; neg: number }>()
  for (const a of articles) {
    const key = dayKey(a.publishedAt)
    if (!key) continue
    const score = clamp(Number(a.score) || 0, -1, 1)
    const bucket = byDay.get(key) ?? { sum: 0, count: 0, pos: 0, neu: 0, neg: 0 }
    bucket.sum += score
    bucket.count += 1
    const label = labelForScore(score)
    if (label === 'positive') bucket.pos += 1
    else if (label === 'negative') bucket.neg += 1
    else bucket.neu += 1
    byDay.set(key, bucket)
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, b]) => ({
      date,
      count: b.count,
      avgScore: round(b.sum / b.count, 4),
      positive: b.pos,
      neutral: b.neu,
      negative: b.neg,
    }))
}

// ── Deviation detection ──────────────────────────────────────────────────────
export interface DeviationOptions {
  /** Trailing days used to compute the baseline (excludes the latest day). */
  baselineDays?: number
  /** Minimum baseline points required before a signal can fire. */
  minBaselineDays?: number
  /** z-score magnitude that counts as a deviation. */
  z?: number
}

export interface DeviationMetric {
  latest: number
  mean: number
  std: number
  z: number
  deviated: boolean
}

export interface DeviationResult {
  /** True when either volume or sentiment deviated from the baseline. */
  hasSignal: boolean
  /** News-volume (article count) deviation — surge only (z >= threshold). */
  volume: DeviationMetric
  /** Mean-sentiment deviation — either direction (|z| >= threshold). */
  sentiment: DeviationMetric
  /** Sentiment swing direction when it deviated, else null. */
  direction: 'positive' | 'negative' | null
  /** Number of baseline days actually used. */
  baselineDays: number
  /** Human-readable summary, always present. */
  note: string
}

export const DEFAULT_DEVIATION_OPTIONS: Required<DeviationOptions> = {
  baselineDays: 14,
  minBaselineDays: 3,
  z: 2,
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** Sample standard deviation (n-1). Returns 0 for fewer than 2 values. */
export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(variance)
}

const EPS = 1e-9

function metric(latest: number, baseline: number[], threshold: number, twoSided: boolean): DeviationMetric {
  const m = mean(baseline)
  const sd = stddev(baseline)
  const z = sd > EPS ? (latest - m) / sd : 0
  const deviated = sd > EPS && (twoSided ? Math.abs(z) >= threshold : z >= threshold)
  return { latest, mean: round(m, 4), std: round(sd, 4), z: round(z, 3), deviated }
}

/**
 * Detect whether the most recent day deviates from its trailing baseline on
 * either news volume (a surge) or mean sentiment (a swing in either
 * direction). Pure: deterministic for a given series + options.
 */
export function computeDeviation(
  series: SentimentDailyPoint[],
  options: DeviationOptions = {},
): DeviationResult {
  const opts = { ...DEFAULT_DEVIATION_OPTIONS, ...options }
  const sorted = [...series].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const empty: DeviationMetric = { latest: 0, mean: 0, std: 0, z: 0, deviated: false }
  if (sorted.length < 2) {
    return {
      hasSignal: false,
      volume: { ...empty, latest: sorted[0]?.count ?? 0 },
      sentiment: { ...empty, latest: sorted[0]?.avgScore ?? 0 },
      direction: null,
      baselineDays: 0,
      note: 'Not enough history to assess deviation.',
    }
  }

  const latest = sorted[sorted.length - 1]
  const baseline = sorted.slice(0, -1).slice(-opts.baselineDays)
  if (baseline.length < opts.minBaselineDays) {
    return {
      hasSignal: false,
      volume: { ...empty, latest: latest.count },
      sentiment: { ...empty, latest: latest.avgScore },
      direction: null,
      baselineDays: baseline.length,
      note: `Baseline too short (${baseline.length} day${baseline.length === 1 ? '' : 's'}); need ${opts.minBaselineDays}.`,
    }
  }

  const volume = metric(latest.count, baseline.map(d => d.count), opts.z, false)
  const sentiment = metric(latest.avgScore, baseline.map(d => d.avgScore), opts.z, true)
  const direction: 'positive' | 'negative' | null = sentiment.deviated
    ? (sentiment.z >= 0 ? 'positive' : 'negative')
    : null
  const hasSignal = volume.deviated || sentiment.deviated

  let note: string
  if (!hasSignal) {
    note = 'Sentiment and news volume are within normal range.'
  } else {
    const parts: string[] = []
    if (volume.deviated) parts.push(`news volume ${volume.z >= 0 ? 'spiked' : 'dropped'} (${volume.z >= 0 ? '+' : ''}${volume.z}σ)`)
    if (sentiment.deviated) parts.push(`sentiment swung ${direction} (${sentiment.z >= 0 ? '+' : ''}${sentiment.z}σ)`)
    note = `Unusual: ${parts.join(' and ')}.`
  }

  return { hasSignal, volume, sentiment, direction, baselineDays: baseline.length, note }
}

// ── Zod contract (request + response) ────────────────────────────────────────
export const sentimentScopeSchema = z.enum(['company', 'sector'])

export const sentimentDailyPointSchema = z.object({
  date: z.string(),
  count: z.number().int().nonnegative(),
  avgScore: z.number(),
  positive: z.number().int().nonnegative(),
  neutral: z.number().int().nonnegative(),
  negative: z.number().int().nonnegative(),
})

const deviationMetricSchema = z.object({
  latest: z.number(),
  mean: z.number(),
  std: z.number(),
  z: z.number(),
  deviated: z.boolean(),
})

export const deviationResultSchema = z.object({
  hasSignal: z.boolean(),
  volume: deviationMetricSchema,
  sentiment: deviationMetricSchema,
  direction: z.enum(['positive', 'negative']).nullable(),
  baselineDays: z.number().int().nonnegative(),
  note: z.string(),
})

export const scoredArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  source: z.string(),
  publishedAt: z.string(),
  score: z.number(),
  label: sentimentScopeSchema.or(z.enum(['positive', 'neutral', 'negative'])),
  method: z.enum(['llm', 'upstream', 'lexicon']),
})

export const sentimentResponseSchema = z.object({
  scope: sentimentScopeSchema,
  symbol: z.string().nullable(),
  sector: z.string().nullable(),
  windowDays: z.number().int().positive(),
  series: z.array(sentimentDailyPointSchema),
  deviation: deviationResultSchema,
  current: z.object({
    avgScore: z.number(),
    label: z.enum(['positive', 'neutral', 'negative']),
    articleCount: z.number().int().nonnegative(),
    positive: z.number().int().nonnegative(),
    neutral: z.number().int().nonnegative(),
    negative: z.number().int().nonnegative(),
  }),
  articles: z.array(scoredArticleSchema),
  source: z.string(),
  generatedAt: z.string(),
})

export type SentimentScope = z.infer<typeof sentimentScopeSchema>
export type ScoredArticleDto = z.infer<typeof scoredArticleSchema>
export type SentimentResponse = z.infer<typeof sentimentResponseSchema>

// ── small helpers ────────────────────────────────────────────────────────────
function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}
function round(x: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(x * f) / f
}
function toNum(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null
}

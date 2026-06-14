/**
 * News-sentiment scoring + monitor (Task #401, server-side).
 *
 * Combines the pure core (`news-sentiment-core.ts`) with:
 *   - a disk + in-memory cache keyed by a stable article hash, so the same
 *     article is never re-scored (and the work survives server restarts),
 *   - a bounded, batched Groq LLM scorer (JSON mode) with a lexicon /
 *     upstream-sentiment fallback so the surface is never empty and never
 *     unbounded in cost, and
 *   - company + sector aggregation that produces a daily sentiment/volume
 *     series plus a trailing-baseline deviation verdict.
 *
 * Resolution order per article: upstream provider sentiment (free) → cache →
 * LLM (only for the most recent, un-scored, un-cached articles, capped) →
 * lexicon heuristic. Only the LLM path costs money, and it is bounded.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

import { fetchAggregatedNews, type RawNewsArticle } from '@/lib/news-fetch'
import {
  lexiconScore,
  labelForScore,
  normalizeUpstreamSentiment,
  aggregateDailySentiment,
  computeDeviation,
  type SentimentLabel,
  type DeviationResult,
  type SentimentDailyPoint,
} from '@/lib/news-sentiment-core'

const GROQ = process.env.GROQ_API_KEY
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']

/** Hard cap on LLM-scored articles per request to bound cost. */
const MAX_LLM_ARTICLES = 24
/** Articles per Groq call. */
const LLM_BATCH_SIZE = 12

export interface ScoredArticle {
  id: string
  title: string
  url: string
  source: string
  publishedAt: string
  score: number
  label: SentimentLabel
  method: 'llm' | 'upstream' | 'lexicon'
}

// ── Curated, bounded sector → constituents map ───────────────────────────────
// Intentionally small (≤6 tickers each) so sector aggregation stays cheap.
export const SECTOR_CONSTITUENTS: Record<string, string[]> = {
  technology: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AVGO'],
  semiconductors: ['NVDA', 'AMD', 'AVGO', 'TSM', 'INTC', 'QCOM'],
  financials: ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C'],
  energy: ['XOM', 'CVX', 'COP', 'SLB', 'EOG'],
  healthcare: ['UNH', 'JNJ', 'LLY', 'PFE', 'MRK', 'ABBV'],
  consumer: ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX'],
  communications: ['NFLX', 'DIS', 'CMCSA', 'T', 'VZ'],
}

export function listSectors(): string[] {
  return Object.keys(SECTOR_CONSTITUENTS)
}

// ── Stable article hash ──────────────────────────────────────────────────────
export function articleHash(a: { id?: string; url?: string; title?: string }): string {
  const basis = (a.id || a.url || a.title || '').trim().toLowerCase()
  return createHash('sha1').update(basis).digest('hex').slice(0, 16)
}

// ── Disk + memory cache (hash → {score, label}) ──────────────────────────────
const TTL_MS = 24 * 60 * 60 * 1000
const CACHE_DIR = path.join(process.cwd(), '.cache', 'news-sentiment')
const CACHE_FILE = path.join(CACHE_DIR, 'scores.json')

interface CachedScore { score: number; label: SentimentLabel; expires: number }
let MEM: Map<string, CachedScore> | null = null
let loadPromise: Promise<void> | null = null

async function loadCache(): Promise<void> {
  if (MEM) return
  if (!loadPromise) {
    loadPromise = (async () => {
      MEM = new Map()
      try {
        const raw = await fs.readFile(CACHE_FILE, 'utf-8')
        const parsed = JSON.parse(raw) as Record<string, CachedScore>
        const now = Date.now()
        for (const [k, v] of Object.entries(parsed)) {
          if (v && v.expires > now) MEM!.set(k, v)
        }
      } catch { /* cold cache */ }
    })()
  }
  await loadPromise
}

let flushTimer: ReturnType<typeof setTimeout> | null = null
function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => { flushTimer = null; void flushCache() }, 1500)
  // Don't keep the event loop alive solely for a cache flush.
  if (typeof flushTimer.unref === 'function') flushTimer.unref()
}

async function flushCache(): Promise<void> {
  if (!MEM) return
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true })
    const obj: Record<string, CachedScore> = {}
    for (const [k, v] of MEM) obj[k] = v
    await fs.writeFile(CACHE_FILE, JSON.stringify(obj), 'utf-8')
  } catch { /* best-effort */ }
}

function cacheGet(hash: string): CachedScore | null {
  const v = MEM?.get(hash)
  if (v && v.expires > Date.now()) return v
  if (v) MEM?.delete(hash)
  return null
}

function cacheSet(hash: string, score: number, label: SentimentLabel): void {
  MEM?.set(hash, { score, label, expires: Date.now() + TTL_MS })
  scheduleFlush()
}

// ── Groq batch scorer ────────────────────────────────────────────────────────
interface LlmItem { i: number; title: string; summary: string }

async function callGroqJson(prompt: string): Promise<unknown | null> {
  if (!GROQ) return null
  for (const model of GROQ_MODELS) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You are a financial news sentiment classifier. Respond ONLY with JSON.' },
            { role: 'user', content: prompt },
          ],
        }),
      })
      if (!res.ok) continue
      const j = await res.json() as { choices?: { message?: { content?: string } }[] }
      const content = j.choices?.[0]?.message?.content
      if (!content) continue
      return JSON.parse(content)
    } catch { /* try next model */ }
  }
  return null
}

async function scoreBatchLLM(items: LlmItem[]): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  if (items.length === 0 || !GROQ) return out
  const prompt =
    'Score the sentiment of each financial news item for the company/market it concerns. ' +
    'Return JSON {"scores":[{"i":<index>,"score":<number between -1 and 1>}]} where -1 is very bearish, ' +
    '0 neutral, +1 very bullish. Items:\n' +
    items.map(it => `${it.i}. ${it.title}${it.summary ? ` — ${it.summary.slice(0, 200)}` : ''}`).join('\n')
  const parsed = await callGroqJson(prompt) as { scores?: { i?: number; score?: number }[] } | null
  if (parsed && Array.isArray(parsed.scores)) {
    for (const row of parsed.scores) {
      if (typeof row.i === 'number' && typeof row.score === 'number' && Number.isFinite(row.score)) {
        out.set(row.i, Math.max(-1, Math.min(1, row.score)))
      }
    }
  }
  return out
}

// ── Per-article scoring with the full resolution waterfall ───────────────────
export async function scoreArticles(
  raw: RawNewsArticle[],
  opts: { useLLM?: boolean; maxLLM?: number } = {},
): Promise<ScoredArticle[]> {
  await loadCache()
  const useLLM = opts.useLLM !== false && !!GROQ
  const maxLLM = opts.maxLLM ?? MAX_LLM_ARTICLES

  const scored: ScoredArticle[] = raw.map(a => {
    const hash = articleHash(a)
    // 1) upstream provider sentiment (free, no LLM)
    const up = normalizeUpstreamSentiment(a.sentiment)
    if (up) {
      cacheSet(hash, up.score, up.label)
      return base(a, up.score, up.label, 'upstream')
    }
    // 2) cache
    const cached = cacheGet(hash)
    if (cached) return base(a, cached.score, cached.label, cached.label === labelForScore(cached.score) ? 'llm' : 'llm')
    // 3) provisional lexicon (may be overwritten by LLM below)
    const lx = lexiconScore(`${a.title}. ${a.summary}`)
    return base(a, lx, labelForScore(lx), 'lexicon')
  })

  if (!useLLM) return scored

  // LLM-score only the lexicon-fallback items (no upstream/cache), most recent
  // first, capped. Everything else already has a real score.
  const pending: { idx: number; hash: string }[] = []
  for (let i = 0; i < scored.length && pending.length < maxLLM; i++) {
    if (scored[i].method === 'lexicon') pending.push({ idx: i, hash: articleHash(raw[i]) })
  }
  for (let b = 0; b < pending.length; b += LLM_BATCH_SIZE) {
    const slice = pending.slice(b, b + LLM_BATCH_SIZE)
    const items: LlmItem[] = slice.map((p, j) => ({ i: j, title: raw[p.idx].title, summary: raw[p.idx].summary }))
    const result = await scoreBatchLLM(items)
    slice.forEach((p, j) => {
      const s = result.get(j)
      if (typeof s === 'number') {
        const label = labelForScore(s)
        scored[p.idx] = { ...scored[p.idx], score: round(s, 4), label, method: 'llm' }
        cacheSet(p.hash, round(s, 4), label)
      }
    })
  }
  return scored
}

// ── Company / sector aggregation + deviation ─────────────────────────────────
export interface SentimentSnapshot {
  scope: 'company' | 'sector'
  symbol: string | null
  sector: string | null
  windowDays: number
  series: SentimentDailyPoint[]
  deviation: DeviationResult
  current: {
    avgScore: number
    label: SentimentLabel
    articleCount: number
    positive: number
    neutral: number
    negative: number
  }
  articles: ScoredArticle[]
  source: string
  generatedAt: string
}

function buildSnapshot(
  scope: 'company' | 'sector',
  symbol: string | null,
  sector: string | null,
  windowDays: number,
  scored: ScoredArticle[],
  sources: string[],
): SentimentSnapshot {
  const series = aggregateDailySentiment(scored.map(a => ({ publishedAt: a.publishedAt, score: a.score })))
  const deviation = computeDeviation(series)
  const latest = series[series.length - 1]
  const current = {
    avgScore: latest?.avgScore ?? 0,
    label: labelForScore(latest?.avgScore ?? 0),
    articleCount: latest?.count ?? 0,
    positive: latest?.positive ?? 0,
    neutral: latest?.neutral ?? 0,
    negative: latest?.negative ?? 0,
  }
  return {
    scope,
    symbol,
    sector,
    windowDays,
    series,
    deviation,
    current,
    articles: scored.slice(0, 30),
    source: sources.length ? sources.join(', ') : 'none',
    generatedAt: new Date().toISOString(),
  }
}

export async function getCompanySentiment(
  symbol: string,
  opts: { days?: number; useLLM?: boolean } = {},
): Promise<SentimentSnapshot> {
  const days = clampDays(opts.days)
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const { articles, sources } = await fetchAggregatedNews({ symbol, limit: 60, from })
  const scored = await scoreArticles(articles, { useLLM: opts.useLLM })
  return buildSnapshot('company', symbol.toUpperCase(), null, days, scored, sources)
}

export async function getSectorSentiment(
  sector: string,
  opts: { days?: number; useLLM?: boolean } = {},
): Promise<SentimentSnapshot | null> {
  const key = sector.toLowerCase()
  const constituents = SECTOR_CONSTITUENTS[key]
  if (!constituents) return null
  const days = clampDays(opts.days)
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

  const results = await Promise.all(
    constituents.map(sym => fetchAggregatedNews({ symbol: sym, limit: 20, from }).catch(() => ({ articles: [], sources: [] }))),
  )
  // Dedupe across constituents by article hash.
  const seen = new Set<string>()
  const merged: RawNewsArticle[] = []
  const sourceSet = new Set<string>()
  for (const r of results) {
    for (const a of r.articles) {
      const h = articleHash(a)
      if (!seen.has(h)) { seen.add(h); merged.push(a) }
    }
    r.sources.forEach(s => sourceSet.add(s))
  }
  const scored = await scoreArticles(merged, { useLLM: opts.useLLM, maxLLM: MAX_LLM_ARTICLES })
  return buildSnapshot('sector', null, key, days, scored, [...sourceSet])
}

// ── helpers ──────────────────────────────────────────────────────────────────
function base(a: RawNewsArticle, score: number, label: SentimentLabel, method: ScoredArticle['method']): ScoredArticle {
  return {
    id: a.id || a.url || a.title,
    title: a.title,
    url: a.url,
    source: a.source,
    publishedAt: a.publishedAt,
    score: round(score, 4),
    label,
    method,
  }
}
function clampDays(d?: number): number {
  const n = Number(d)
  if (!Number.isFinite(n)) return 30
  return Math.max(7, Math.min(90, Math.round(n)))
}
function round(x: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(x * f) / f
}

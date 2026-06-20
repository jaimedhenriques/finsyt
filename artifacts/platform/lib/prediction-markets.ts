/**
 * Prediction-market odds provider (Task #395)
 * ───────────────────────────────────────────
 * Read-only adapters for two public prediction-market venues:
 *
 *   - Polymarket — fully public Gamma API (no key, no auth).
 *   - Kalshi     — public market-data API (read-only market listings need
 *                  no credentials; only trading requires an API key, which
 *                  this module never touches).
 *
 * Both adapters normalise to a single `PredictionMarket` shape so the
 * `/api/prediction-markets` route, the Predictions UI, the company-page
 * tile and the `get_prediction_markets` agent tool all consume one
 * contract. Every market carries a `source` label and a `url` link back to
 * the originating market. No odds history / backfill, no trading.
 */
import { z } from 'zod'
import { recordKeyAccepted, recordKeyRejection } from './credential-health'

// ── Normalised contract ──────────────────────────────────────────────────────

export const PredictionOutcomeSchema = z.object({
  label: z.string(),
  probability: z.number().nullable(),
})

export const PredictionMarketSchema = z.object({
  id: z.string(),
  provider: z.enum(['polymarket', 'kalshi']),
  source: z.string(),
  question: z.string(),
  category: z.string().nullable(),
  /** Implied probability (0..1) of the lead / "Yes" outcome. */
  yesProbability: z.number().nullable(),
  outcomes: z.array(PredictionOutcomeSchema),
  /** Probability-point move over the last day (e.g. +0.04 = +4pts). */
  oneDayChange: z.number().nullable(),
  volume: z.number().nullable(),
  liquidity: z.number().nullable(),
  closeDate: z.string().nullable(),
  url: z.string(),
  active: z.boolean(),
})

export type PredictionOutcome = z.infer<typeof PredictionOutcomeSchema>
export type PredictionMarket = z.infer<typeof PredictionMarketSchema>

export type PredictionSource = 'polymarket' | 'kalshi' | 'both'

const POLY_BASE = 'https://gamma-api.polymarket.com'
const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2'
// Provider responses are cached for 5 minutes — odds drift slowly enough at
// research cadence and this keeps us well clear of any soft rate limits.
const REVALIDATE = 300

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[, _$%]/g, ''))
  return Number.isFinite(n) ? n : null
}

function safeJsonArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

// ── Polymarket (Gamma API, public) ───────────────────────────────────────────

interface PolyMarketRow {
  id?: string | number
  question?: string
  slug?: string
  category?: string
  active?: boolean
  closed?: boolean
  outcomes?: unknown
  outcomePrices?: unknown
  volumeNum?: number | string
  volume?: number | string
  liquidityNum?: number | string
  liquidity?: number | string
  oneDayPriceChange?: number | string
  endDate?: string
  groupItemTitle?: string
}

function normalizePolymarket(row: PolyMarketRow, eventSlug?: string): PredictionMarket | null {
  const question = (row.question || row.groupItemTitle || '').trim()
  if (!question) return null

  const labels = safeJsonArray(row.outcomes).map((x) => String(x))
  const prices = safeJsonArray(row.outcomePrices).map((x) => num(x))
  const outcomes: PredictionOutcome[] = labels.length
    ? labels.map((label, i) => ({ label, probability: prices[i] ?? null }))
    : []

  // Lead probability: the "Yes" outcome when present, else the highest.
  let yesProbability: number | null = null
  const yesIdx = outcomes.findIndex((o) => o.label.toLowerCase() === 'yes')
  if (yesIdx >= 0) {
    yesProbability = outcomes[yesIdx].probability
  } else {
    for (const o of outcomes) {
      if (o.probability != null && (yesProbability == null || o.probability > yesProbability)) {
        yesProbability = o.probability
      }
    }
  }

  const slug = (row.slug || '').trim()
  return {
    id: `polymarket:${row.id ?? slug ?? question.slice(0, 40)}`,
    provider: 'polymarket',
    source: 'Polymarket',
    question,
    category: (row.category || '').trim() || null,
    yesProbability,
    outcomes,
    oneDayChange: num(row.oneDayPriceChange),
    volume: num(row.volumeNum ?? row.volume),
    liquidity: num(row.liquidityNum ?? row.liquidity),
    closeDate: row.endDate || null,
    url: eventSlug
      ? `https://polymarket.com/event/${eventSlug}`
      : slug ? `https://polymarket.com/event/${slug}` : 'https://polymarket.com',
    active: row.active !== false && row.closed !== true,
  }
}

async function fetchPolymarket(limit: number): Promise<PredictionMarket[]> {
  const url = new URL(`${POLY_BASE}/markets`)
  url.searchParams.set('active', 'true')
  url.searchParams.set('closed', 'false')
  url.searchParams.set('archived', 'false')
  url.searchParams.set('order', 'volumeNum')
  url.searchParams.set('ascending', 'false')
  url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 500)))

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    next: { revalidate: REVALIDATE },
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) recordKeyRejection('polymarket', `HTTP ${res.status}`)
    throw new Error(`Polymarket HTTP ${res.status}`)
  }
  recordKeyAccepted('polymarket')
  const data = await res.json()
  const rows: PolyMarketRow[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
  return rows.map((r) => normalizePolymarket(r)).filter((m): m is PredictionMarket => m != null)
}

interface PolyEventRow {
  slug?: string
  markets?: PolyMarketRow[]
}

/**
 * Polymarket keyword search via the public `public-search` endpoint. The
 * listing `/markets` route caps each page at 100 rows ordered by volume, so
 * it misses most company-specific markets; search returns matching events
 * (with nested markets) regardless of volume. Each nested market links back
 * to its parent event page.
 */
async function fetchPolymarketSearch(term: string, limit: number): Promise<PredictionMarket[]> {
  const url = new URL(`${POLY_BASE}/public-search`)
  url.searchParams.set('q', term)
  url.searchParams.set('events_status', 'active')
  url.searchParams.set('limit_per_type', String(Math.min(Math.max(limit, 1), 50)))

  // Search responses embed full nested market objects and routinely exceed
  // Next's 2MB fetch-cache ceiling, so skip the data cache here.
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) recordKeyRejection('polymarket', `HTTP ${res.status}`)
    throw new Error(`Polymarket search HTTP ${res.status}`)
  }
  recordKeyAccepted('polymarket')
  const data = await res.json()
  const events: PolyEventRow[] = Array.isArray(data?.events) ? data.events : []
  const out: PredictionMarket[] = []
  for (const ev of events) {
    for (const m of ev.markets || []) {
      if (m.closed === true || m.active === false) continue
      const norm = normalizePolymarket(m, ev.slug)
      if (norm) out.push(norm)
    }
  }
  return out
}

// ── Kalshi (public market-data API, read-only) ───────────────────────────────

interface KalshiMarketRow {
  ticker?: string
  event_ticker?: string
  title?: string
  subtitle?: string
  yes_sub_title?: string
  category?: string
  status?: string
  // Kalshi's public API returns prices already denominated in dollars (0..1)
  // with `_dollars` suffixes, and sizes as fixed-point `_fp` numbers.
  last_price_dollars?: number
  previous_price_dollars?: number
  volume_fp?: number
  volume_24h_fp?: number
  open_interest_fp?: number
  liquidity_dollars?: number
  close_time?: string
}

function normalizeKalshi(row: KalshiMarketRow, categoryHint?: string): PredictionMarket | null {
  const question = (row.title || row.yes_sub_title || '').trim()
  if (!question) return null

  // `*_dollars` fields are already probabilities in the 0..1 range.
  const last = num(row.last_price_dollars)
  const prev = num(row.previous_price_dollars)
  const yesProbability = last != null ? +last.toFixed(4) : null
  const oneDayChange = last != null && prev != null ? +(last - prev).toFixed(4) : null

  const outcomes: PredictionOutcome[] = yesProbability != null
    ? [
        { label: 'Yes', probability: yesProbability },
        { label: 'No', probability: +(1 - yesProbability).toFixed(4) },
      ]
    : []

  const eventTicker = (row.event_ticker || row.ticker || '').trim()
  return {
    id: `kalshi:${row.ticker ?? eventTicker ?? question.slice(0, 40)}`,
    provider: 'kalshi',
    source: 'Kalshi',
    question: row.subtitle ? `${question} — ${row.subtitle}` : question,
    category: (row.category || categoryHint || '').trim() || null,
    yesProbability,
    outcomes,
    oneDayChange,
    volume: num(row.volume_fp),
    liquidity: num(row.liquidity_dollars ?? row.open_interest_fp),
    closeDate: row.close_time || null,
    url: eventTicker ? `https://kalshi.com/markets/${eventTicker}` : 'https://kalshi.com',
    active: (row.status || '').toLowerCase() === 'active' || (row.status || '').toLowerCase() === 'open',
  }
}

interface KalshiSeriesRow {
  ticker?: string
  title?: string
  category?: string
}

async function kalshiGet(path: string): Promise<unknown> {
  const res = await fetch(`${KALSHI_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: REVALIDATE },
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) recordKeyRejection('kalshi', `HTTP ${res.status}`)
    throw new Error(`Kalshi HTTP ${res.status}`)
  }
  recordKeyAccepted('kalshi')
  return res.json()
}

// Kalshi categories whose series carry tradable, research-relevant odds.
// (The bare `/markets` listing is dominated by unpriced sports parlays, so we
// discover markets through these categories' series instead.)
const KALSHI_CATEGORIES = ['Financials', 'Economics', 'Politics', 'Crypto']

// Kalshi's `/series?category=` response ignores `limit` and can exceed 3MB
// (Next refuses to cache anything over 2MB), so we cache the series catalog
// per-category in-process. Series membership changes rarely.
const KALSHI_SERIES_TTL_MS = 10 * 60 * 1000
const kalshiSeriesCache = new Map<string, { at: number; data: KalshiSeriesRow[] }>()

async function getKalshiSeries(category: string): Promise<KalshiSeriesRow[]> {
  const hit = kalshiSeriesCache.get(category)
  if (hit && Date.now() - hit.at < KALSHI_SERIES_TTL_MS) return hit.data
  const res = await fetch(`${KALSHI_BASE}/series?category=${encodeURIComponent(category)}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) recordKeyRejection('kalshi', `HTTP ${res.status}`)
    throw new Error(`Kalshi HTTP ${res.status}`)
  }
  recordKeyAccepted('kalshi')
  const data = (await res.json()) as { series?: KalshiSeriesRow[] }
  const list = Array.isArray(data?.series) ? data.series : []
  kalshiSeriesCache.set(category, { at: Date.now(), data: list })
  return list
}

async function fetchKalshiSeriesMarkets(series: KalshiSeriesRow, perSeries: number): Promise<PredictionMarket[]> {
  if (!series.ticker) return []
  const data = (await kalshiGet(
    `/markets?series_ticker=${encodeURIComponent(series.ticker)}&status=open&limit=${perSeries}`,
  )) as { markets?: KalshiMarketRow[] }
  const rows = Array.isArray(data?.markets) ? data.markets : []
  return rows.map((r) => normalizeKalshi(r, series.category)).filter((m): m is PredictionMarket => m != null)
}

/**
 * Kalshi discovery. The public `/markets` listing front-loads thousands of
 * unpriced sports/multivariate contracts, so we instead resolve series for a
 * handful of research-relevant categories and fetch their open markets. When a
 * keyword is supplied we keep only series whose ticker/title matches it (Kalshi
 * has no public full-text market search); otherwise we sample across categories.
 */
async function fetchKalshi(limit: number, keyword?: string): Promise<PredictionMarket[]> {
  const needle = (keyword || '').trim().toLowerCase()
  const catLists = await Promise.all(
    KALSHI_CATEGORIES.map((c) => getKalshiSeries(c).catch(() => [] as KalshiSeriesRow[])),
  )
  let series = catLists.flat()

  if (needle) {
    series = series.filter(
      (s) => (s.title || '').toLowerCase().includes(needle) || (s.ticker || '').toLowerCase().includes(needle),
    )
  }
  // Bound fan-out: cap how many series we query per request.
  const maxSeries = needle ? 12 : 40
  series = series.slice(0, maxSeries)

  const perSeries = Math.min(Math.max(Math.ceil(limit / Math.max(series.length, 1)) + 2, 4), 20)
  const results = await Promise.all(
    series.map((s) => fetchKalshiSeriesMarkets(s, perSeries).catch(() => [] as PredictionMarket[])),
  )
  return results.flat()
}

// ── Keyword / company relevance ──────────────────────────────────────────────

const COMPANY_STOPWORDS = new Set([
  'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited',
  'plc', 'holdings', 'holding', 'group', 'sa', 'ag', 'nv', 'class', 'the', 'and',
  'technologies', 'technology', 'systems', 'international', 'plc.',
])

/** Significant lower-case tokens for a company name (suffixes stripped). */
export function companyKeywords(name: string, symbol?: string): string[] {
  const out = new Set<string>()
  const cleaned = (name || '')
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 3 && !COMPANY_STOPWORDS.has(w))
  for (const w of cleaned) out.add(w)
  // Whole cleaned name (first significant chunk) as a phrase anchor.
  const phrase = cleaned.join(' ')
  if (phrase) out.add(phrase)
  if (symbol && symbol.trim().length >= 3) out.add(symbol.trim().toLowerCase())
  return [...out]
}

/** Relevance score of a market to a keyword set (0 = no match). */
function relevanceScore(market: PredictionMarket, keywords: string[]): number {
  if (!keywords.length) return 0
  const hay = `${market.question} ${market.category ?? ''}`.toLowerCase()
  let score = 0
  for (const kw of keywords) {
    if (!kw) continue
    // Multi-word phrase: substring match. Single token: word-boundary match.
    if (kw.includes(' ')) {
      if (hay.includes(kw)) score += 3
    } else {
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (re.test(hay)) score += kw.length >= 5 ? 2 : 1
    }
  }
  return score
}

// ── Public query surface ─────────────────────────────────────────────────────

export interface PredictionQuery {
  /** Free-text keyword filter. */
  q?: string
  /** Company name for relevance matching (used with `symbol`). */
  name?: string
  /** Ticker for relevance matching. */
  symbol?: string
  /** Category contains-filter (case-insensitive). */
  category?: string
  /** Which venues to query. */
  source?: PredictionSource
  /** Max markets to return after ranking. */
  limit?: number
}

export interface PredictionResult {
  markets: PredictionMarket[]
  source: string
  count: number
  providers: { polymarket: 'ok' | 'error' | 'skipped'; kalshi: 'ok' | 'error' | 'skipped' }
  providerError: string | null
  fetchedAt: string
}

/**
 * Fetch + normalise + rank prediction markets from the requested venues.
 * - With `name`/`symbol`: only company-relevant markets, ranked by relevance.
 * - With `q`: substring keyword filter.
 * - Otherwise: most-active markets by volume.
 */
export async function getPredictionMarkets(query: PredictionQuery = {}): Promise<PredictionResult> {
  const source: PredictionSource = query.source || 'both'
  const limit = Math.min(Math.max(query.limit ?? 30, 1), 100)

  const wantPoly = source === 'both' || source === 'polymarket'
  const wantKalshi = source === 'both' || source === 'kalshi'

  // A keyword/company query routes Polymarket through `public-search` (broad
  // coverage); the bare browse uses the volume-ranked listing. Kalshi has no
  // public text search, so it always returns its open-markets listing and is
  // keyword-filtered client-side. The over-fetch gives ranking a useful pool.
  const isFiltered = !!(query.q || query.name || query.symbol || query.category)
  const fetchLimit = isFiltered ? 300 : limit
  // Search term for Polymarket: prefer the company name, else symbol, else q.
  const searchTerm = (query.name || query.symbol || query.q || '').trim()

  const providers: PredictionResult['providers'] = {
    polymarket: wantPoly ? 'ok' : 'skipped',
    kalshi: wantKalshi ? 'ok' : 'skipped',
  }
  const errors: string[] = []

  const polyTask = wantPoly
    ? (searchTerm ? fetchPolymarketSearch(searchTerm, 40) : fetchPolymarket(fetchLimit))
        .catch((e: unknown) => { providers.polymarket = 'error'; errors.push(`polymarket: ${e instanceof Error ? e.message : String(e)}`); return [] as PredictionMarket[] })
    : Promise.resolve([] as PredictionMarket[])
  const kalshiTask = wantKalshi
    ? fetchKalshi(fetchLimit, searchTerm || undefined).catch((e: unknown) => { providers.kalshi = 'error'; errors.push(`kalshi: ${e instanceof Error ? e.message : String(e)}`); return [] as PredictionMarket[] })
    : Promise.resolve([] as PredictionMarket[])

  const [polyRes, kalshiRes] = await Promise.all([polyTask, kalshiTask])

  // Drop markets with no implied odds — a prediction market without a price
  // is not a usable research signal (and Kalshi's listing is full of empty
  // sub-contracts). Every surfaced row therefore carries a real probability.
  let markets = [...polyRes, ...kalshiRes].filter((m) => m.yesProbability != null)

  // Category filter.
  if (query.category) {
    const c = query.category.toLowerCase()
    markets = markets.filter((m) => (m.category ?? '').toLowerCase().includes(c))
  }

  // Company relevance OR free-text keyword.
  const keywords = query.name || query.symbol ? companyKeywords(query.name || '', query.symbol) : []
  if (keywords.length) {
    markets = markets
      .map((m) => ({ m, s: relevanceScore(m, keywords) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || (b.m.volume ?? 0) - (a.m.volume ?? 0))
      .map((x) => x.m)
  } else if (query.q) {
    const needle = query.q.toLowerCase()
    markets = markets
      .filter((m) => m.question.toLowerCase().includes(needle) || (m.category ?? '').toLowerCase().includes(needle))
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
  } else {
    markets = markets.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
  }

  markets = markets.slice(0, limit)

  // Compose a human-readable `source` label for UI attribution.
  const used = new Set(markets.map((m) => m.source))
  let sourceLabel: string
  if (used.size === 0) sourceLabel = 'none'
  else if (used.size === 1) sourceLabel = [...used][0]
  else sourceLabel = [...used].join(' + ')

  return {
    markets,
    source: sourceLabel,
    count: markets.length,
    providers,
    providerError: errors.length ? errors.join('; ') : null,
    fetchedAt: new Date().toISOString(),
  }
}

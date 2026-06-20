/**
 * altDataCache — shared client-side cache for Apify alt-data (Task #326)
 * ─────────────────────────────────────────────────────────────────────
 * The Insider / People / Signal cards now render on the company page as
 * well as the screener, portfolio and peers pages. Without a shared cache
 * every page mount (and every card) would re-detect the Apify Actors
 * connection and re-run the actor for the same ticker — multiplying paid
 * Apify spend for no benefit.
 *
 * This module gives all callers a single in-memory, TTL'd cache keyed by
 * ticker / company so that:
 *   - the Apify connection is detected at most once per TTL window;
 *   - repeated lookups of the same ticker (e.g. AAPL on the company page,
 *     then again in a peer set) reuse the first result;
 *   - concurrent lookups of the same key share one in-flight request.
 *
 * The cache is process-local (per browser tab). It is intentionally simple
 * — no persistence, no eviction beyond TTL expiry — because the working set
 * is small (the tickers a user clicks through in one session).
 */

export interface ConnectionRow {
  id: string
  definitionSlug: string | null
  status: string
}

export interface CapitolTrade {
  politician: string
  party?: string
  chamber?: string
  type: string
  amount?: string
  filed?: string
  traded?: string
  ticker?: string
  url?: string
  raw: unknown
}

export interface GlassdoorSnapshot {
  rating?: number
  reviewCount?: number
  recommendPct?: number
  ceoApprovePct?: number
  pros?: string[]
  cons?: string[]
  medianSalary?: string
  url?: string
  /** 12-week rating trend (oldest→newest), nulls where a week had no reviews. */
  ratingTrend?: (number | null)[]
}

export interface FilingSignal {
  accession: string
  score: number
  sections: string[]
  /** Direct link to the underlying filing on EDGAR, when the actor reports one. */
  url?: string
  /** Form type (10-K / 10-Q / 8-K …) when reported. */
  formType?: string
  /** Filing date when reported. */
  filedAt?: string
}

export interface FilingSignals {
  /** Normalised-accession → signal, for joining into a filings table. */
  byAccession: Record<string, { score: number; sections: string[] }>
  /** Flat list (highest score first) for summary card rendering. */
  items: FilingSignal[]
}

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// TTLs mirror the per-actor cache hints documented in the Connector Hub:
// Capitol Trades 15m, Glassdoor 1h, SEC filings 1h. Connection detection
// is cheap but we still cache it briefly to avoid a burst on first paint.
const TTL_CONNECTION = 60_000
const TTL_CAPITOL = 15 * 60_000
const TTL_GLASSDOOR = 60 * 60_000
const TTL_SIGNALS = 60 * 60_000

interface Entry<T> { value?: T; ts: number; promise?: Promise<T> }

const store = new Map<string, Entry<unknown>>()

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const existing = store.get(key) as Entry<T> | undefined
  if (existing) {
    if (existing.value !== undefined && now - existing.ts < ttlMs) return existing.value
    if (existing.promise) return existing.promise
  }
  const promise = fn()
    .then((value) => { store.set(key, { value, ts: Date.now() }); return value })
    .catch((err) => { store.delete(key); throw err })
  store.set(key, { ts: now, promise })
  return promise
}

/** Clear the whole cache (used by tests / manual refresh hooks). */
export function clearAltDataCache(): void { store.clear() }

export function normAccession(v: unknown): string {
  if (!v) return ''
  return String(v).replace(/[-\s]/g, '').toLowerCase()
}

/** Detect the workspace's active `apify-actors` connection (cached). */
export function getApifyConnection(): Promise<ConnectionRow | null> {
  return cached('apify:connection', TTL_CONNECTION, async () => {
    const r = await fetch(`${BASE}/api/connectors/connections`)
    const d = r.ok ? await r.json() : { connections: [] }
    const match = (d.connections as ConnectionRow[] | undefined || [])
      .find((c) => c.definitionSlug === 'apify-actors' && c.status === 'active')
    return match || null
  })
}

async function execute(connId: string, operation: string, params: Record<string, unknown>): Promise<unknown> {
  const r = await fetch(`${BASE}/api/connectors/connections/${connId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, params }),
  })
  const d = await r.json()
  if (!d?.ok) throw new Error(d?.error || `${operation} failed`)
  return d.data
}

export function fetchCapitolTrades(connId: string, symbol: string): Promise<CapitolTrade[]> {
  const sym = symbol.toUpperCase()
  return cached(`apify:capitol:${connId}:${sym}`, TTL_CAPITOL, async () => {
    const data = await execute(connId, 'capitol_trades', { ticker: sym, limit: 60 })
    const rows: any[] = Array.isArray(data) ? data : []
    return rows.map((row: any): CapitolTrade => ({
      politician: row.politician || row.name || row.repName || 'Unknown member',
      party: row.party || row.politicianParty,
      chamber: row.chamber || row.house,
      type: row.type || row.transactionType || row.transaction || 'Trade',
      amount: row.amount || row.value || row.range,
      filed: row.filed || row.filedAt || row.disclosureDate,
      traded: row.traded || row.transactionDate,
      ticker: row.ticker || sym,
      url: row.url || row.disclosureUrl,
      raw: row,
    }))
  })
}

export function fetchGlassdoor(connId: string, companyName: string, symbol: string): Promise<GlassdoorSnapshot | null> {
  const name = companyName || symbol
  return cached(`apify:glassdoor:${connId}:${name.toLowerCase()}`, TTL_GLASSDOOR, async () => {
    const data = await execute(connId, 'glassdoor_company', { companyName: name, country: 'us', maxReviews: 60 })
    const rows: any[] = Array.isArray(data) ? data : [data]
    const head = rows[0] || {}
    const reviewRows = rows.length > 1 ? rows : (Array.isArray(head.reviews) ? head.reviews : [])
    const ratings = reviewRows
      .map((r: any) => Number(r.overallRating ?? r.rating))
      .filter((n: number) => Number.isFinite(n))
    const avgRating = ratings.length
      ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
      : Number(head.rating ?? head.overallRating)
    const pros = uniq(reviewRows.map((r: any) => r.pros).concat(head.pros).filter(Boolean) as string[]).slice(0, 4)
    const cons = uniq(reviewRows.map((r: any) => r.cons).concat(head.cons).filter(Boolean) as string[]).slice(0, 4)
    // ── 12-week rating trend from dated reviews (no extra Apify spend;
    //    aggregated from the rows this same actor run already returned).
    const dated = reviewRows
      .map((r: any) => ({
        ts: parseDate(r.reviewDate ?? r.date ?? r.publishedAt ?? r.reviewDateTime ?? r.createdAt),
        value: Number(r.overallRating ?? r.rating),
      }))
      .filter((r: { ts: number | null; value: number }) => r.ts != null && Number.isFinite(r.value))
    const ratingTrend = dated.length ? bucketAvgByWeek(dated as { ts: number; value: number }[]) : undefined
    const snapshot: GlassdoorSnapshot = {
      rating: Number.isFinite(avgRating) ? Math.round(avgRating * 10) / 10 : undefined,
      reviewCount: head.reviewCount ?? reviewRows.length,
      recommendPct: head.recommendPct ?? head.recommendToFriend,
      ceoApprovePct: head.ceoApprovePct ?? head.ceoApprove,
      pros,
      cons,
      medianSalary: head.medianSalary || head.medianBaseSalary,
      url: head.url || head.companyUrl,
      ratingTrend,
    }
    return snapshot
  })
}

export function fetchFilingSignals(connId: string, symbol: string): Promise<FilingSignals> {
  const sym = symbol.toUpperCase()
  return cached(`apify:signals:${connId}:${sym}`, TTL_SIGNALS, async () => {
    const data = await execute(connId, 'sec_filings_intelligence', { ticker: sym, limit: 12 })
    const items: any[] = Array.isArray(data) ? data : []
    const byAccession: Record<string, { score: number; sections: string[] }> = {}
    const flat: FilingSignal[] = []
    for (const it of items) {
      const a = normAccession(it.accession || it.accessionNumber || it.accNum)
      const sectionList: string[] = Array.isArray(it.materialSections)
        ? it.materialSections
        : Array.isArray(it.highlights) ? it.highlights.map((h: any) => h.section || h.title || String(h)) : []
      const rawScore = Number(it.signalScore ?? it.score ?? it.signal)
      const score = Number.isFinite(rawScore)
        ? Math.max(0, Math.min(100, Math.round(rawScore)))
        : Math.min(100, sectionList.length * 12 + 20)
      const sections = sectionList.slice(0, 4)
      const signal: FilingSignal = {
        accession: a,
        score,
        sections,
        url: it.url || it.filingUrl || it.link || it.documentUrl || undefined,
        formType: it.formType || it.form || it.type || undefined,
        filedAt: it.filedAt || it.filingDate || it.filed || it.date || undefined,
      }
      if (a) byAccession[a] = { score, sections }
      flat.push(signal)
    }
    flat.sort((a, b) => b.score - a.score)
    return { byAccession, items: flat }
  })
}

function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)) }

// ── Trend aggregation helpers ─────────────────────────────────────────
export const TREND_WEEKS = 12

/** Parse a date-ish value into a ms timestamp, or null if unusable. */
export function parseDate(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Heuristic: seconds-since-epoch vs ms-since-epoch.
    const ms = v < 1e11 ? v * 1000 : v
    return Number.isNaN(ms) ? null : ms
  }
  const s = String(v).trim()
  if (!s) return null
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

/** Index (0 = oldest, TREND_WEEKS-1 = current) for a timestamp, or -1 if out of window. */
function weekIndex(ts: number, now: number): number {
  const weeksAgo = Math.floor((now - ts) / (7 * 24 * 60 * 60 * 1000))
  if (weeksAgo < 0 || weeksAgo >= TREND_WEEKS) return -1
  return TREND_WEEKS - 1 - weeksAgo
}

/** Count events per week over the last TREND_WEEKS (oldest→newest). */
export function bucketCountByWeek(timestamps: number[]): number[] {
  const now = Date.now()
  const out = new Array<number>(TREND_WEEKS).fill(0)
  for (const ts of timestamps) {
    const idx = weekIndex(ts, now)
    if (idx >= 0) out[idx] += 1
  }
  return out
}

/** Average a value per week over the last TREND_WEEKS (oldest→newest); null where empty. */
export function bucketAvgByWeek(items: { ts: number; value: number }[]): (number | null)[] {
  const now = Date.now()
  const sums = new Array<number>(TREND_WEEKS).fill(0)
  const counts = new Array<number>(TREND_WEEKS).fill(0)
  for (const it of items) {
    const idx = weekIndex(it.ts, now)
    if (idx >= 0) { sums[idx] += it.value; counts[idx] += 1 }
  }
  return sums.map((s, i) => (counts[i] ? Math.round((s / counts[i]) * 100) / 100 : null))
}

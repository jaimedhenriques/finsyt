/**
 * Geopolitical events provider (Task #400)
 * ────────────────────────────────────────
 * A clean-room geopolitical risk & events feed built **only** on an open,
 * keyless dataset: the GDELT Project's public DOC 2.0 API
 * (https://api.gdeltproject.org/api/v2/doc/doc). GDELT continuously monitors
 * world news and tags articles with curated GKG "themes" (armed conflict,
 * protest, natural disaster, sanctions, …). We query a small set of those
 * themes, restrict to English-language coverage so categorisation is
 * reliable, and normalise every article into a single `GeoEvent` shape:
 *
 *   { location, category, severity, date, summary, source }
 *
 * Scope guardrails (deliberate omissions):
 *   - No maritime / vessel tracking, no proprietary or paid feeds.
 *   - No predictive risk-scoring model. `severity` is a transparent,
 *     category-derived label (conflict/disaster → high, sanctions/political →
 *     medium, otherwise low), NOT a learned score. Relevance to a company is
 *     a simple region match against its HQ country.
 *
 * Every result carries a `source` attribution ("GDELT") and a `url` back to
 * the originating article so the UI tiles, the `/api/geopolitical-events`
 * route and the `get_geopolitical_events` agent tool all consume one
 * contract.
 */
import { z } from 'zod'
import { recordKeyAccepted, recordKeyRejection } from './credential-health'

// ── Normalised contract ──────────────────────────────────────────────────────

export const GEO_CATEGORIES = ['conflict', 'political', 'disaster', 'economic', 'geopolitical'] as const
export type GeoCategory = (typeof GEO_CATEGORIES)[number]

export const GEO_SEVERITIES = ['high', 'medium', 'low'] as const
export type GeoSeverity = (typeof GEO_SEVERITIES)[number]

export const GeoEventSchema = z.object({
  id: z.string(),
  /** One-line summary (the article headline). */
  title: z.string(),
  category: z.enum(GEO_CATEGORIES),
  /** Transparent category-derived label — not a predictive score. */
  severity: z.enum(GEO_SEVERITIES),
  /** Reporting source country (best-effort region attribution), or null. */
  location: z.string().nullable(),
  /** FIPS country code when the feed was region-filtered, else null. */
  countryCode: z.string().nullable(),
  /** ISO-8601 timestamp of when the article was first seen. */
  date: z.string().nullable(),
  url: z.string(),
  domain: z.string().nullable(),
  language: z.string().nullable(),
  imageUrl: z.string().nullable(),
  source: z.literal('GDELT'),
})

export type GeoEvent = z.infer<typeof GeoEventSchema>

const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc'
// GDELT asks for ≤ 1 request / 5s. We cache aggressively (in-process + Next
// data cache) so research-cadence browsing stays well under that ceiling.
const REVALIDATE = 600

// GKG themes whose coverage maps cleanly onto geopolitical risk. Kept small
// and conservative so the OR query never trips GDELT's theme validation.
const GDELT_THEMES = [
  'ARMEDCONFLICT', 'TERROR', 'MILITARY',
  'PROTEST', 'ECON_SANCTIONS', 'ELECTION',
  'NATURAL_DISASTER',
]

// ── Country mapping (ISO-3166 alpha-2 ↔ GDELT/FIPS code ↔ display name) ───────
// GDELT's `sourcecountry:` operator uses FIPS 10-4 codes, which diverge from
// the ISO alpha-2 codes the company /api/quote endpoint returns (e.g. UK vs GB,
// JA vs JP, CH vs CN). We keep a focused table of major markets; unknown
// countries fall back to an unfiltered global feed rather than erroring.
interface CountryDef { iso2: string; fips: string; name: string }
const COUNTRIES: CountryDef[] = [
  { iso2: 'US', fips: 'US', name: 'United States' },
  { iso2: 'GB', fips: 'UK', name: 'United Kingdom' },
  { iso2: 'CA', fips: 'CA', name: 'Canada' },
  { iso2: 'MX', fips: 'MX', name: 'Mexico' },
  { iso2: 'BR', fips: 'BR', name: 'Brazil' },
  { iso2: 'AR', fips: 'AR', name: 'Argentina' },
  { iso2: 'DE', fips: 'GM', name: 'Germany' },
  { iso2: 'FR', fips: 'FR', name: 'France' },
  { iso2: 'IT', fips: 'IT', name: 'Italy' },
  { iso2: 'ES', fips: 'SP', name: 'Spain' },
  { iso2: 'NL', fips: 'NL', name: 'Netherlands' },
  { iso2: 'CH', fips: 'SZ', name: 'Switzerland' },
  { iso2: 'SE', fips: 'SW', name: 'Sweden' },
  { iso2: 'NO', fips: 'NO', name: 'Norway' },
  { iso2: 'IE', fips: 'EI', name: 'Ireland' },
  { iso2: 'RU', fips: 'RS', name: 'Russia' },
  { iso2: 'UA', fips: 'UP', name: 'Ukraine' },
  { iso2: 'PL', fips: 'PL', name: 'Poland' },
  { iso2: 'TR', fips: 'TU', name: 'Turkey' },
  { iso2: 'IL', fips: 'IS', name: 'Israel' },
  { iso2: 'SA', fips: 'SA', name: 'Saudi Arabia' },
  { iso2: 'AE', fips: 'AE', name: 'United Arab Emirates' },
  { iso2: 'IN', fips: 'IN', name: 'India' },
  { iso2: 'CN', fips: 'CH', name: 'China' },
  { iso2: 'JP', fips: 'JA', name: 'Japan' },
  { iso2: 'KR', fips: 'KS', name: 'South Korea' },
  { iso2: 'TW', fips: 'TW', name: 'Taiwan' },
  { iso2: 'HK', fips: 'HK', name: 'Hong Kong' },
  { iso2: 'SG', fips: 'SN', name: 'Singapore' },
  { iso2: 'AU', fips: 'AS', name: 'Australia' },
  { iso2: 'NZ', fips: 'NZ', name: 'New Zealand' },
  { iso2: 'ZA', fips: 'SF', name: 'South Africa' },
  { iso2: 'NG', fips: 'NI', name: 'Nigeria' },
  { iso2: 'EG', fips: 'EG', name: 'Egypt' },
  { iso2: 'ID', fips: 'ID', name: 'Indonesia' },
  { iso2: 'TH', fips: 'TH', name: 'Thailand' },
  { iso2: 'VN', fips: 'VM', name: 'Vietnam' },
  { iso2: 'PH', fips: 'RP', name: 'Philippines' },
  { iso2: 'PK', fips: 'PK', name: 'Pakistan' },
]

const ISO2_TO_DEF = new Map(COUNTRIES.map((c) => [c.iso2, c]))
const FIPS_TO_DEF = new Map(COUNTRIES.map((c) => [c.fips, c]))

/** Countries we expose in region pickers (sorted by display name). */
export function geoCountries(): { code: string; name: string }[] {
  return [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ code: c.iso2, name: c.name }))
}

/**
 * Resolve a user-supplied region token (ISO-2, FIPS, or display name) to a
 * GDELT FIPS code + display name. Returns null when unknown (→ global feed).
 */
function resolveRegion(region: string | undefined): CountryDef | null {
  if (!region) return null
  const r = region.trim()
  if (!r) return null
  const up = r.toUpperCase()
  if (ISO2_TO_DEF.has(up)) return ISO2_TO_DEF.get(up)!
  if (FIPS_TO_DEF.has(up)) return FIPS_TO_DEF.get(up)!
  const byName = COUNTRIES.find((c) => c.name.toLowerCase() === r.toLowerCase())
  return byName || null
}

// ── Categorisation + severity (transparent heuristics, not a model) ──────────

const CATEGORY_KEYWORDS: { category: GeoCategory; words: string[] }[] = [
  { category: 'conflict', words: ['war', 'conflict', 'military', 'troops', 'airstrike', 'air strike', 'missile', 'militant', 'insurgent', 'ceasefire', 'armed', 'invasion', 'clash', 'offensive', 'soldier', 'rebel', 'drone strike', 'shelling', 'terror', 'attack', 'gunmen', 'bombing'] },
  { category: 'disaster', words: ['earthquake', 'flood', 'hurricane', 'typhoon', 'wildfire', 'drought', 'famine', 'cyclone', 'eruption', 'volcano', 'landslide', 'outbreak', 'epidemic', 'tsunami', 'storm', 'disaster', 'evacuat'] },
  { category: 'economic', words: ['sanction', 'tariff', 'embargo', 'export ban', 'blacklist', 'export control', 'trade war', 'currency crisis', 'default'] },
  { category: 'political', words: ['election', 'protest', 'coup', 'parliament', 'summit', 'diplomatic', 'referendum', 'treaty', 'minister', 'president', 'vote', 'sanctions vote', 'impeach', 'unrest', 'uprising', 'demonstration'] },
]

function categorize(title: string): GeoCategory {
  const t = title.toLowerCase()
  for (const { category, words } of CATEGORY_KEYWORDS) {
    if (words.some((w) => t.includes(w))) return category
  }
  return 'geopolitical'
}

// Transparent category → severity mapping. NOT a predictive scoring model;
// it simply reflects that armed conflict / disaster coverage is inherently
// higher-stakes than routine political or economic news.
const CATEGORY_SEVERITY: Record<GeoCategory, GeoSeverity> = {
  conflict: 'high',
  disaster: 'high',
  economic: 'medium',
  political: 'medium',
  geopolitical: 'low',
}

// ── GDELT fetch + normalise ──────────────────────────────────────────────────

interface GdeltArticle {
  url?: string
  title?: string
  seendate?: string
  domain?: string
  language?: string
  sourcecountry?: string
  socialimage?: string
}

/** Parse GDELT's `20260614T180000Z` timestamp into ISO-8601. */
function parseSeenDate(s: string | undefined): string | null {
  if (!s) return null
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, se] = m
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${se}Z`
  const dt = new Date(iso)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

function normalizeArticle(a: GdeltArticle, region: CountryDef | null): GeoEvent | null {
  const title = (a.title || '').trim()
  const url = (a.url || '').trim()
  if (!title || !url) return null
  const category = categorize(title)
  return {
    id: `gdelt:${url}`,
    title,
    category,
    severity: CATEGORY_SEVERITY[category],
    location: (a.sourcecountry || '').trim() || region?.name || null,
    countryCode: region?.fips || null,
    date: parseSeenDate(a.seendate),
    url,
    domain: (a.domain || '').trim() || null,
    language: (a.language || '').trim() || null,
    imageUrl: (a.socialimage || '').trim() || null,
    source: 'GDELT',
  }
}

// In-process response cache keyed by the resolved request URL. GDELT rate-limits
// to ~1 request / 5s; this (plus Next's data cache) keeps repeated browsing and
// the company-tile fan-out from ever tripping it.
const RESPONSE_TTL_MS = 5 * 60 * 1000
const responseCache = new Map<string, { at: number; events: GeoEvent[] }>()

function buildQuery(opts: { region: CountryDef | null; q?: string }): string {
  const themeClause = `(${GDELT_THEMES.map((t) => `theme:${t}`).join(' OR ')})`
  const parts = [themeClause, 'sourcelang:english']
  if (opts.region) parts.push(`sourcecountry:${opts.region.fips}`)
  if (opts.q && opts.q.trim()) parts.push(`"${opts.q.trim().replace(/"/g, '')}"`)
  return parts.join(' ')
}

async function fetchGdelt(query: string, maxRecords: number, timespan: string): Promise<GeoEvent[]> {
  const url = new URL(GDELT_BASE)
  url.searchParams.set('query', query)
  url.searchParams.set('mode', 'artlist')
  url.searchParams.set('format', 'json')
  url.searchParams.set('maxrecords', String(Math.min(Math.max(maxRecords, 1), 250)))
  url.searchParams.set('sort', 'datedesc')
  url.searchParams.set('timespan', timespan)

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    next: { revalidate: REVALIDATE },
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      recordKeyRejection('gdelt', `HTTP ${res.status}`)
    }
    throw new Error(`GDELT HTTP ${res.status}`)
  }
  recordKeyAccepted('gdelt')
  // GDELT returns a plain-text rate-limit notice (not JSON) when throttled.
  const text = await res.text()
  let data: { articles?: GdeltArticle[] }
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('GDELT rate-limited or returned non-JSON')
  }
  return (Array.isArray(data.articles) ? data.articles : [])
    .map((a) => normalizeArticle(a, null))
    .filter((e): e is GeoEvent => e != null)
}

// ── Public query surface ─────────────────────────────────────────────────────

export interface GeoQuery {
  /** Free-text keyword filter (also passed to GDELT as a phrase). */
  q?: string
  /** Region: ISO-2, FIPS code, or country display name. */
  region?: string
  /** Category contains-filter. */
  category?: GeoCategory | string
  /** Severity floor (e.g. 'high' returns only high). */
  severity?: GeoSeverity | string
  /** GDELT timespan, e.g. '24h', '3d', '7d', '14d'. Default '7d'. */
  timespan?: string
  /** Max events to return. */
  limit?: number
}

export interface GeoResult {
  events: GeoEvent[]
  source: string
  count: number
  region: string | null
  regionName: string | null
  /** Per-category counts of the returned events (for filter chips / rollups). */
  categoryCounts: Record<GeoCategory, number>
  providerError: string | null
  fetchedAt: string
}

const VALID_TIMESPANS = new Set(['24h', '48h', '3d', '7d', '14d', '30d'])
const SEVERITY_RANK: Record<GeoSeverity, number> = { high: 3, medium: 2, low: 1 }

/**
 * Fetch + normalise + filter geopolitical events from GDELT.
 * - `region`: scope to a country's English-language coverage (HQ relevance).
 * - `q`: keyword filter (applied at GDELT and locally).
 * - `category` / `severity`: post-filters over the normalised feed.
 */
export async function getGeopoliticalEvents(query: GeoQuery = {}): Promise<GeoResult> {
  const region = resolveRegion(query.region)
  const limit = Math.min(Math.max(query.limit ?? 30, 1), 100)
  const timespan = query.timespan && VALID_TIMESPANS.has(query.timespan) ? query.timespan : '7d'
  const gdeltQuery = buildQuery({ region, q: query.q })

  let events: GeoEvent[] = []
  let providerError: string | null = null

  const cacheKey = `${gdeltQuery}::${timespan}`
  const hit = responseCache.get(cacheKey)
  if (hit && Date.now() - hit.at < RESPONSE_TTL_MS) {
    events = hit.events
  } else {
    try {
      // Over-fetch so post-filters (category/severity/keyword) still have a pool.
      events = await fetchGdelt(gdeltQuery, 120, timespan)
      responseCache.set(cacheKey, { at: Date.now(), events })
    } catch (e) {
      providerError = e instanceof Error ? e.message : String(e)
      // Serve a stale cache entry if we have one rather than an empty feed.
      if (hit) events = hit.events
    }
  }

  // Stamp the resolved region onto each event so the UI can show it even when
  // GDELT's per-article sourcecountry is blank.
  if (region) {
    events = events.map((e) => ({ ...e, countryCode: region.fips, location: e.location || region.name }))
  }

  // Category filter.
  if (query.category) {
    const c = String(query.category).toLowerCase()
    events = events.filter((e) => e.category === c)
  }
  // Severity floor.
  if (query.severity && SEVERITY_RANK[query.severity as GeoSeverity]) {
    const floor = SEVERITY_RANK[query.severity as GeoSeverity]
    events = events.filter((e) => SEVERITY_RANK[e.severity] >= floor)
  }
  // Local keyword filter (GDELT phrase match is fuzzy).
  if (query.q && query.q.trim()) {
    const needle = query.q.trim().toLowerCase()
    events = events.filter((e) => e.title.toLowerCase().includes(needle))
  }

  // Rank: severity desc, then most recent first.
  events = events
    .slice()
    .sort((a, b) => {
      const s = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
      if (s !== 0) return s
      return (b.date || '').localeCompare(a.date || '')
    })

  const categoryCounts = GEO_CATEGORIES.reduce((acc, c) => {
    acc[c] = events.filter((e) => e.category === c).length
    return acc
  }, {} as Record<GeoCategory, number>)

  events = events.slice(0, limit)

  return {
    events,
    source: events.length || !providerError ? 'GDELT' : 'none',
    count: events.length,
    region: region?.iso2 || null,
    regionName: region?.name || null,
    categoryCounts,
    providerError,
    fetchedAt: new Date().toISOString(),
  }
}

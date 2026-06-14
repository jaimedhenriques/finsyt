/**
 * IMF DataMapper API Provider
 * ───────────────────────────
 * Thin wrapper around the IMF's free, public DataMapper API.
 *   - https://www.imf.org/external/datamapper/api/v1
 * No API key required. Surfaces IMF World Economic Outlook (WEO), Fiscal
 * Monitor and related datasets as annual cross-country time-series (GDP,
 * inflation, unemployment, gov debt/GDP, current account, etc.).
 *
 * Powers:
 *   - /api/imf/* internal routes
 *   - /api/v1/imf/* public routes
 *   - the agent's get_macro_series tool (source="imf")
 *
 * Why this matters: World Bank fills the cross-country *development* gap; the
 * IMF fills the cross-country *forecast & fiscal* gap (WEO ships projections
 * out several years, plus debt/deficit/current-account framing FRED lacks for
 * non-US economies).
 *
 * Docs: https://www.imf.org/external/datamapper/api/help
 */

const IMF_BASE = 'https://www.imf.org/external/datamapper/api/v1'
const DEFAULT_TIMEOUT_MS = 15_000

const META_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const DATA_CACHE_TTL_MS = 60 * 60 * 1000 // 1h

// Input bounds — defensive caps so caller-supplied params can't produce
// pathological upstream URLs or unbounded cache keys.
const MAX_INDICATOR_LEN = 64
const MAX_COUNTRIES = 60
const MAX_COUNTRY_CODE_LEN = 8
const MAX_QUERY_LEN = 100

/** Clamp a caller-supplied limit to a sane positive bound (or undefined). */
function clampLimit(n: number | undefined, max = 1000): number | undefined {
  if (n === undefined || n === null || !Number.isFinite(n)) return undefined
  const i = Math.floor(n)
  if (i <= 0) return undefined
  return Math.min(i, max)
}

/** Typed error so route handlers can map to clean HTTP status codes. */
export class ImfApiError extends Error {
  httpStatus: number
  constructor(message: string, httpStatus: number) {
    super(message)
    this.name = 'ImfApiError'
    this.httpStatus = httpStatus
  }
}

async function imfFetch<T = unknown>(url: URL): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    let r: Response
    try {
      r = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Finsyt/1.0 (+https://finsyt.com)',
        },
      })
    } catch (e) {
      const err = e as Error & { name?: string }
      if (err && (err.name === 'AbortError' || /aborted/i.test(err.message || ''))) {
        throw new ImfApiError(`IMF DataMapper timeout after ${DEFAULT_TIMEOUT_MS}ms (url=${url.toString()})`, 504)
      }
      // Network-level failure (DNS / refused / blocked egress) — surface as a
      // retryable 503 rather than a hard 500 so clients degrade gracefully.
      throw new ImfApiError(`IMF DataMapper unreachable: ${err.message} (url=${url.toString()})`, 503)
    }

    if (!r.ok) {
      const body = await r.text().catch(() => '')
      const isThrottle = r.status === 429 || r.status === 503 || r.status === 504
      throw new ImfApiError(
        `IMF DataMapper ${r.status}: ${body.slice(0, 240)} (url=${url.toString()})`,
        isThrottle ? 503 : 502,
      )
    }

    const txt = await r.text()
    if (!txt.trim()) {
      throw new ImfApiError(`IMF DataMapper returned empty body (url=${url.toString()})`, 502)
    }
    if (txt.startsWith('<')) {
      throw new ImfApiError(
        `IMF DataMapper returned XML/HTML (likely an error page); url=${url.toString()}`,
        502,
      )
    }
    try {
      return JSON.parse(txt) as T
    } catch {
      throw new ImfApiError(`IMF DataMapper returned non-JSON response: ${txt.slice(0, 120)}`, 502)
    }
  } finally {
    clearTimeout(timer)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicators (the data dictionary)
// ─────────────────────────────────────────────────────────────────────────────

export interface ImfIndicator {
  id: string          // e.g. "NGDP_RPCH"
  label: string       // e.g. "Real GDP growth"
  description?: string
  source?: string     // e.g. "World Economic Outlook (April 2026)"
  unit?: string       // e.g. "Annual percent change"
  dataset?: string    // e.g. "WEO"
}

interface ImfIndicatorsRaw {
  indicators?: Record<string, {
    label?: string
    description?: string
    source?: string
    unit?: string
    dataset?: string
  }>
}

let _indicatorCache: { at: number; data: ImfIndicator[] } | null = null

/**
 * Full IMF DataMapper indicator catalog. Cached 24h. The API returns the
 * complete dictionary in one call, so this is a bulk fetch + client filter.
 */
export async function imfListIndicators(opts?: { q?: string; dataset?: string; limit?: number }): Promise<ImfIndicator[]> {
  if (!_indicatorCache || Date.now() - _indicatorCache.at > META_CACHE_TTL_MS) {
    const json = await imfFetch<ImfIndicatorsRaw>(new URL(`${IMF_BASE}/indicators`))
    if (!json || typeof json.indicators !== 'object' || json.indicators === null) {
      throw new ImfApiError('IMF /indicators returned unexpected shape', 502)
    }
    const data: ImfIndicator[] = Object.entries(json.indicators).map(([id, v]) => ({
      id,
      label: v?.label || id,
      description: v?.description,
      source: v?.source,
      unit: v?.unit,
      dataset: v?.dataset,
    }))
    _indicatorCache = { at: Date.now(), data }
  }

  let rows = _indicatorCache.data
  if (opts?.dataset) {
    const d = opts.dataset.slice(0, MAX_INDICATOR_LEN).toLowerCase()
    rows = rows.filter(r => (r.dataset || '').toLowerCase() === d)
  }
  if (opts?.q) {
    const q = opts.q.slice(0, MAX_QUERY_LEN).toLowerCase()
    rows = rows.filter(r =>
      r.id.toLowerCase().includes(q) ||
      r.label.toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q),
    )
  }
  const limit = clampLimit(opts?.limit)
  if (limit) rows = rows.slice(0, limit)
  return rows
}

// ─────────────────────────────────────────────────────────────────────────────
// Countries
// ─────────────────────────────────────────────────────────────────────────────

export interface ImfCountry {
  id: string     // 3-letter ISO, e.g. "USA"
  label: string  // e.g. "United States"
}

let _countryCache: { at: number; data: ImfCountry[] } | null = null

export async function imfListCountries(opts?: { q?: string; limit?: number }): Promise<ImfCountry[]> {
  if (!_countryCache || Date.now() - _countryCache.at > META_CACHE_TTL_MS) {
    const json = await imfFetch<{ countries?: Record<string, { label?: string }> }>(new URL(`${IMF_BASE}/countries`))
    if (!json || typeof json.countries !== 'object' || json.countries === null) {
      throw new ImfApiError('IMF /countries returned unexpected shape', 502)
    }
    const data: ImfCountry[] = Object.entries(json.countries).map(([id, v]) => ({ id, label: v?.label || id }))
    _countryCache = { at: Date.now(), data }
  }
  let rows = _countryCache.data
  if (opts?.q) {
    const q = opts.q.slice(0, MAX_QUERY_LEN).toLowerCase()
    rows = rows.filter(c => c.id.toLowerCase().includes(q) || c.label.toLowerCase().includes(q))
  }
  const limit = clampLimit(opts?.limit)
  if (limit) rows = rows.slice(0, limit)
  return rows
}

/** Best-effort ISO3 → country name lookup using the cached country list. */
async function countryNameMap(): Promise<Map<string, string>> {
  try {
    const list = await imfListCountries()
    return new Map(list.map(c => [c.id.toUpperCase(), c.label]))
  } catch {
    return new Map()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicator data (the actual time-series)
// ─────────────────────────────────────────────────────────────────────────────

export interface ImfObservation {
  countryIso3: string
  countryName?: string
  indicatorId: string
  date: string             // year as string, e.g. "2024"
  value: number | null
}

export interface ImfSeriesResult {
  source: 'imf'
  indicator: string
  indicatorLabel?: string
  unit?: string
  countries: string[]
  observations: ImfObservation[]
  count: number
}

const _seriesCache = new Map<string, { at: number; data: ImfSeriesResult }>()

/**
 * Fetch annual indicator data for one or more countries.
 *   - `indicator` is a DataMapper code, e.g. "NGDP_RPCH".
 *   - `countries` is one ISO3 code, an array, or a comma/semicolon list.
 *
 * NOTE: the DataMapper path-level country filter is unreliable (it has been
 * observed returning the full country set), so we always filter client-side to
 * the requested codes. When no country is given we return every country the
 * indicator covers.
 */
export async function imfFetchSeries(opts: {
  indicator: string
  countries?: string[] | string
}): Promise<ImfSeriesResult> {
  if (!opts.indicator) throw new ImfApiError('imf: indicator is required (e.g. NGDP_RPCH)', 400)
  if (opts.indicator.length > MAX_INDICATOR_LEN) {
    throw new ImfApiError(`imf: indicator code too long (max ${MAX_INDICATOR_LEN} chars)`, 400)
  }

  const reqCountries = (Array.isArray(opts.countries)
    ? opts.countries
    : (opts.countries ? String(opts.countries).split(/[;,]/) : []))
    .map(c => c.trim().toUpperCase())
    .filter(Boolean)
    .filter(c => c.length <= MAX_COUNTRY_CODE_LEN)
    .slice(0, MAX_COUNTRIES)

  const ck = `${opts.indicator}|${reqCountries.slice().sort().join(',')}`
  const cached = _seriesCache.get(ck)
  if (cached && Date.now() - cached.at < DATA_CACHE_TTL_MS) return cached.data

  // Append countries to the path as a hint (cheap when honoured) but never
  // rely on it — we filter the response ourselves below.
  const path = reqCountries.length
    ? `${encodeURIComponent(opts.indicator)}/${reqCountries.map(encodeURIComponent).join('/')}`
    : encodeURIComponent(opts.indicator)

  const json = await imfFetch<{ values?: Record<string, Record<string, Record<string, number | null>>> }>(
    new URL(`${IMF_BASE}/${path}`),
  )
  const block = json?.values?.[opts.indicator] || {}

  // Indicator + country metadata (both cached, best-effort).
  let label: string | undefined
  let unit: string | undefined
  try {
    const inds = await imfListIndicators()
    const m = inds.find(i => i.id === opts.indicator)
    label = m?.label
    unit = m?.unit
  } catch { /* meta optional */ }
  const names = await countryNameMap()

  const want = new Set(reqCountries)
  const observations: ImfObservation[] = []
  for (const [iso3, byYear] of Object.entries(block)) {
    if (want.size && !want.has(iso3.toUpperCase())) continue
    for (const [year, val] of Object.entries(byYear || {})) {
      const num = val === null || val === undefined ? null : Number(val)
      observations.push({
        countryIso3: iso3,
        countryName: names.get(iso3.toUpperCase()),
        indicatorId: opts.indicator,
        date: String(year),
        value: num !== null && Number.isFinite(num) ? num : null,
      })
    }
  }
  observations.sort((a, b) => a.countryIso3.localeCompare(b.countryIso3) || a.date.localeCompare(b.date))

  const countries = Array.from(new Set(observations.map(o => o.countryIso3))).filter(Boolean)
  const result: ImfSeriesResult = {
    source: 'imf',
    indicator: opts.indicator,
    indicatorLabel: label,
    unit,
    countries,
    observations,
    count: observations.length,
  }
  _seriesCache.set(ck, { at: Date.now(), data: result })
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────

export async function imfHealthCheck(): Promise<{ ok: boolean; error?: string }> {
  try {
    await imfFetch(new URL(`${IMF_BASE}/countries`))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export const IMF_PROVIDER_META = {
  label: 'IMF DataMapper',
  category: 'macro' as const,
  tier: 'free' as const,
  coverage: 'IMF WEO + Fiscal Monitor annual series across 190+ economies, incl. multi-year forecasts',
  fields: [
    'real GDP growth', 'nominal GDP', 'GDP per capita', 'inflation',
    'unemployment', 'gov gross debt/GDP', 'fiscal balance/GDP',
    'current account/GDP', 'population',
  ],
  docs: 'https://www.imf.org/external/datamapper/api/help',
  envName: null,
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: a curated list of the most-used IMF WEO indicators so the UI &
// agent can suggest sensible defaults.
// ─────────────────────────────────────────────────────────────────────────────

export const IMF_FEATURED_INDICATORS: Array<{ id: string; name: string; category: string }> = [
  { id: 'NGDP_RPCH',     name: 'Real GDP growth (annual % change)',           category: 'Growth' },
  { id: 'NGDPD',         name: 'GDP, current prices (US$ billions)',          category: 'Growth' },
  { id: 'NGDPDPC',       name: 'GDP per capita, current prices (US$)',        category: 'Growth' },
  { id: 'PCPIPCH',       name: 'Inflation, avg consumer prices (annual %)',   category: 'Prices' },
  { id: 'PCPIEPCH',      name: 'Inflation, end-of-period prices (annual %)',  category: 'Prices' },
  { id: 'LUR',           name: 'Unemployment rate (% of labor force)',        category: 'Labor' },
  { id: 'LP',            name: 'Population (persons, millions)',              category: 'Demographics' },
  { id: 'GGXWDG_NGDP',   name: 'General govt gross debt (% of GDP)',          category: 'Public Finance' },
  { id: 'GGXCNL_NGDP',   name: 'General govt net lending/borrowing (% GDP)',  category: 'Public Finance' },
  { id: 'BCA_NGDPD',     name: 'Current account balance (% of GDP)',         category: 'External Sector' },
]

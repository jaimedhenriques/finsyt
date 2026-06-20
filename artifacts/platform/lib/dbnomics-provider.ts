/**
 * DBnomics API Provider
 * ─────────────────────
 * Thin wrapper around DBnomics' free, public aggregation API.
 *   - https://api.db.nomics.world/v22
 * No API key required. DBnomics federates 90+ official providers (Eurostat,
 * ECB, BIS, IMF, World Bank, OECD, national stats offices, …) behind a single
 * `provider/dataset/series` addressing scheme.
 *
 * Powers:
 *   - /api/dbnomics/* internal routes
 *   - /api/v1/dbnomics/* public routes
 *   - the agent's get_macro_series tool (source="dbnomics")
 *
 * Why this matters: DBnomics is the long-tail macro catalog. World Bank / IMF
 * cover the headline cross-country aggregates; DBnomics reaches everything else
 * (regional CPI, policy rates, PMIs, sector output) via a uniform interface.
 *
 * Reachability note: this upstream is not always reachable from every egress
 * environment. All failures (network refusal, empty body, timeout) surface as
 * a typed `DbnomicsApiError` that route handlers map to a retryable 503 so the
 * UI shows an honest "upstream unavailable" state instead of crashing.
 *
 * Docs: https://db.nomics.world/docs/api/
 */

const DBNOMICS_BASE = 'https://api.db.nomics.world/v22'
const DEFAULT_TIMEOUT_MS = 15_000

const DATA_CACHE_TTL_MS = 60 * 60 * 1000 // 1h
const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000 // 30m

// Input bounds — defensive caps so caller-supplied params can't produce
// pathological upstream URLs or unbounded cache keys.
const MAX_QUERY_LEN = 100
const MAX_SERIES_ID_LEN = 256

/** Typed error so route handlers can map to clean HTTP status codes. */
export class DbnomicsApiError extends Error {
  httpStatus: number
  constructor(message: string, httpStatus: number) {
    super(message)
    this.name = 'DbnomicsApiError'
    this.httpStatus = httpStatus
  }
}

async function dbnomicsFetch<T = unknown>(url: URL): Promise<T> {
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
        throw new DbnomicsApiError(`DBnomics API timeout after ${DEFAULT_TIMEOUT_MS}ms (url=${url.toString()})`, 504)
      }
      // Network-level failure (blocked egress / refused / DNS) — retryable 503.
      throw new DbnomicsApiError(`DBnomics API unreachable: ${err.message} (url=${url.toString()})`, 503)
    }

    if (!r.ok) {
      const body = await r.text().catch(() => '')
      const isThrottle = r.status === 429 || r.status === 503 || r.status === 504
      throw new DbnomicsApiError(
        `DBnomics API ${r.status}: ${body.slice(0, 240)} (url=${url.toString()})`,
        r.status === 404 ? 404 : isThrottle ? 503 : 502,
      )
    }

    const txt = await r.text()
    if (!txt.trim()) {
      // Empty body without an error status is how the blocked-egress case
      // manifests here; treat it as a retryable upstream-unavailable signal.
      throw new DbnomicsApiError(`DBnomics API returned empty body (url=${url.toString()})`, 503)
    }
    if (txt.startsWith('<')) {
      throw new DbnomicsApiError(
        `DBnomics API returned XML/HTML (likely an error page); url=${url.toString()}`,
        502,
      )
    }
    try {
      return JSON.parse(txt) as T
    } catch {
      throw new DbnomicsApiError(`DBnomics API returned non-JSON response: ${txt.slice(0, 120)}`, 502)
    }
  } finally {
    clearTimeout(timer)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Search (dataset-level discovery)
// ─────────────────────────────────────────────────────────────────────────────

export interface DbnomicsDatasetHit {
  providerCode: string
  datasetCode: string
  name: string
  nbSeries?: number
  indexedAt?: string
}

interface DbnomicsSearchRaw {
  results?: {
    docs?: Array<{
      provider_code?: string
      provider_name?: string
      code?: string
      dataset_code?: string
      name?: string
      nb_series?: number
      indexed_at?: string
    }>
    num_found?: number
  }
}

const _searchCache = new Map<string, { at: number; data: DbnomicsDatasetHit[] }>()

/**
 * Search the DBnomics catalog. Results are dataset-level; the caller drills
 * into a dataset to pick a concrete `provider/dataset/series` id.
 */
export async function dbnomicsSearch(opts: { q: string; limit?: number }): Promise<DbnomicsDatasetHit[]> {
  if (!opts.q || !opts.q.trim()) throw new DbnomicsApiError('dbnomics: q is required', 400)
  const q = opts.q.trim().slice(0, MAX_QUERY_LEN)
  const limit = Math.min(Math.max(1, Math.floor(opts.limit || 20)), 100)
  const ck = `${q.toLowerCase()}|${limit}`
  const cached = _searchCache.get(ck)
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) return cached.data

  const url = new URL(`${DBNOMICS_BASE}/search`)
  url.searchParams.set('q', q)
  url.searchParams.set('limit', String(limit))
  const json = await dbnomicsFetch<DbnomicsSearchRaw>(url)
  const docs = json?.results?.docs || []
  const data: DbnomicsDatasetHit[] = docs.map(d => ({
    providerCode: d.provider_code || '',
    datasetCode: d.code || d.dataset_code || '',
    name: d.name || `${d.provider_code || ''}/${d.code || d.dataset_code || ''}`,
    nbSeries: d.nb_series,
    indexedAt: d.indexed_at,
  })).filter(d => d.providerCode && d.datasetCode)
  _searchCache.set(ck, { at: Date.now(), data })
  return data
}

// ─────────────────────────────────────────────────────────────────────────────
// Series data (the actual time-series)
// ─────────────────────────────────────────────────────────────────────────────

export interface DbnomicsObservation {
  period: string
  value: number | null
}

export interface DbnomicsSeriesResult {
  source: 'dbnomics'
  seriesId: string         // "provider/dataset/series"
  providerCode: string
  datasetCode: string
  seriesCode: string
  seriesName?: string
  frequency?: string
  observations: DbnomicsObservation[]
  count: number
}

interface DbnomicsSeriesRaw {
  series?: {
    docs?: Array<{
      provider_code?: string
      dataset_code?: string
      series_code?: string
      series_name?: string
      '@frequency'?: string
      period?: string[]
      original_period?: string[]
      value?: Array<number | string | null>
    }>
  }
}

const _seriesCache = new Map<string, { at: number; data: DbnomicsSeriesResult }>()

/**
 * Fetch a single DBnomics series. Address it either with a full
 * `seriesId` ("provider/dataset/series") or the three parts separately.
 */
export async function dbnomicsFetchSeries(opts: {
  seriesId?: string
  provider?: string
  dataset?: string
  series?: string
}): Promise<DbnomicsSeriesResult> {
  let seriesId = opts.seriesId?.trim()
  if (!seriesId && opts.provider && opts.dataset && opts.series) {
    seriesId = `${opts.provider.trim()}/${opts.dataset.trim()}/${opts.series.trim()}`
  }
  if (!seriesId) {
    throw new DbnomicsApiError('dbnomics: provide seriesId (provider/dataset/series) or provider+dataset+series', 400)
  }
  if (seriesId.split('/').length < 3) {
    throw new DbnomicsApiError(`dbnomics: malformed series id "${seriesId}" — expected provider/dataset/series`, 400)
  }
  if (seriesId.length > MAX_SERIES_ID_LEN) {
    throw new DbnomicsApiError(`dbnomics: series id too long (max ${MAX_SERIES_ID_LEN} chars)`, 400)
  }

  const cached = _seriesCache.get(seriesId)
  if (cached && Date.now() - cached.at < DATA_CACHE_TTL_MS) return cached.data

  const url = new URL(`${DBNOMICS_BASE}/series`)
  url.searchParams.set('series_ids', seriesId)
  url.searchParams.set('observations', '1')
  const json = await dbnomicsFetch<DbnomicsSeriesRaw>(url)
  const doc = json?.series?.docs?.[0]
  if (!doc) throw new DbnomicsApiError(`dbnomics: series not found: ${seriesId}`, 404)

  const periods = doc.period || doc.original_period || []
  const values = doc.value || []
  const observations: DbnomicsObservation[] = periods.map((p, i) => {
    const v = values[i]
    const num = v === 'NA' || v === null || v === undefined ? null : Number(v)
    return { period: String(p), value: num !== null && Number.isFinite(num) ? num : null }
  })

  const result: DbnomicsSeriesResult = {
    source: 'dbnomics',
    seriesId,
    providerCode: doc.provider_code || seriesId.split('/')[0],
    datasetCode: doc.dataset_code || seriesId.split('/')[1],
    seriesCode: doc.series_code || seriesId.split('/').slice(2).join('/'),
    seriesName: doc.series_name,
    frequency: doc['@frequency'],
    observations,
    count: observations.length,
  }
  _seriesCache.set(seriesId, { at: Date.now(), data: result })
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────

export async function dbnomicsHealthCheck(): Promise<{ ok: boolean; error?: string }> {
  try {
    await dbnomicsFetch(new URL(`${DBNOMICS_BASE}/providers`))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export const DBNOMICS_PROVIDER_META = {
  label: 'DBnomics',
  category: 'macro' as const,
  tier: 'free' as const,
  coverage: '90+ official providers (Eurostat, ECB, BIS, IMF, World Bank, OECD, national stats) via one provider/dataset/series scheme',
  fields: [
    'GDP', 'inflation/CPI', 'unemployment', 'policy rates', 'PMIs',
    'industrial production', 'trade', 'exchange rates', 'monetary aggregates',
  ],
  docs: 'https://db.nomics.world/docs/api/',
  envName: null,
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: a small curated list of well-known DBnomics series ids the UI
// can offer as one-click starting points. These are examples — DBnomics series
// codes can drift over time, so the UI renders an honest "unavailable" state if
// any of them stops resolving rather than treating the list as guaranteed.
// ─────────────────────────────────────────────────────────────────────────────

export const DBNOMICS_FEATURED_SERIES: Array<{ id: string; name: string; category: string }> = [
  { id: 'IMF/WEO:latest/USA.NGDP_RPCH',                       name: 'US real GDP growth (IMF WEO)',          category: 'Growth' },
  { id: 'IMF/WEO:latest/CHN.NGDP_RPCH',                       name: 'China real GDP growth (IMF WEO)',       category: 'Growth' },
  { id: 'Eurostat/une_rt_m/M.SA.TOTAL.PC_ACT.T.EA20',        name: 'Euro-area unemployment rate',           category: 'Labor' },
  { id: 'Eurostat/prc_hicp_manr/M.RCH_A.CP00.EA20',          name: 'Euro-area HICP inflation (YoY)',        category: 'Prices' },
  { id: 'BIS/WS_CBPOL_D/D.US',                                name: 'US policy rate (BIS)',                  category: 'Rates' },
  { id: 'WB/WDI/A-NY.GDP.MKTP.CD-US',                         name: 'US GDP, current US$ (World Bank)',      category: 'Growth' },
]

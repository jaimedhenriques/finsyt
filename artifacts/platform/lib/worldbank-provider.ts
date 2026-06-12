/**
 * World Bank Open Data API Provider
 * ─────────────────────────────────
 * Thin wrapper around the World Bank's free, public Open Data API.
 *   - https://api.worldbank.org/v2/
 * No API key required. Covers ~1,500 development & macro indicators across
 * 200+ countries and aggregates (income groups, regions, lending categories).
 *
 * Powers:
 *   - /api/worldbank/* internal routes
 *   - /api/v1/worldbank/* public routes
 *   - finsyt_worldbank_* MCP tools
 *
 * Why this matters: Fincept Terminal lists "World Bank" as a core data
 * connector. Most fintech UIs rely on FRED for US macro and have nothing for
 * the rest of the world; the World Bank fills that gap (GDP per capita, life
 * expectancy, FX reserves, debt/GDP, business climate, etc. for any country).
 *
 * Docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation
 */

const WB_BASE = 'https://api.worldbank.org/v2'
const DEFAULT_TIMEOUT_MS = 15_000

const META_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const DATA_CACHE_TTL_MS = 60 * 60 * 1000 // 1h

/** Typed error so route handlers can map to clean HTTP status codes. */
export class WorldBankApiError extends Error {
  httpStatus: number
  constructor(message: string, httpStatus: number) {
    super(message)
    this.name = 'WorldBankApiError'
    this.httpStatus = httpStatus
  }
}

async function wbFetch<T = unknown>(url: URL): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    // World Bank API requires &format=json explicitly; default is XML.
    if (!url.searchParams.has('format')) url.searchParams.set('format', 'json')
    if (!url.searchParams.has('per_page')) url.searchParams.set('per_page', '500')
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
        throw new WorldBankApiError(`World Bank API timeout after ${DEFAULT_TIMEOUT_MS}ms (url=${url.toString()})`, 504)
      }
      throw e
    }

    if (!r.ok) {
      const body = await r.text().catch(() => '')
      const isThrottle = r.status === 429 || r.status === 503 || r.status === 504
      throw new WorldBankApiError(
        `World Bank API ${r.status}: ${body.slice(0, 240)} (url=${url.toString()})`,
        isThrottle ? 503 : 502,
      )
    }

    const txt = await r.text()
    if (!txt.trim()) {
      throw new WorldBankApiError(`World Bank API returned empty body (url=${url.toString()})`, 502)
    }
    if (txt.startsWith('<')) {
      throw new WorldBankApiError(
        `World Bank API returned XML/HTML (likely an error page); url=${url.toString()}`,
        502,
      )
    }
    try {
      return JSON.parse(txt) as T
    } catch {
      throw new WorldBankApiError(
        `World Bank API returned non-JSON response: ${txt.slice(0, 120)}`,
        502,
      )
    }
  } finally {
    clearTimeout(timer)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicators (the data dictionary)
// ─────────────────────────────────────────────────────────────────────────────

export interface WorldBankIndicator {
  id: string                         // e.g. "NY.GDP.MKTP.CD"
  name: string                       // e.g. "GDP (current US$)"
  unit?: string
  source: { id: string; value: string }
  sourceNote?: string
  sourceOrganization?: string
  topics?: { id: string; value: string }[]
}

interface WBIndicatorRaw {
  id: string
  name: string
  unit?: string
  source?: { id: string; value: string }
  sourceNote?: string
  sourceOrganization?: string
  topics?: { id: string; value: string }[]
}

let _indicatorCache: { at: number; data: WorldBankIndicator[] } | null = null

/**
 * Full World Bank indicator catalog. Cached 24h. The API returns ~16,000+
 * indicators total (across all sources), so this is a one-time bulk fetch +
 * client-side filter.
 */
export async function worldbankListIndicators(opts?: { q?: string; topic?: string; source?: string; limit?: number }): Promise<WorldBankIndicator[]> {
  if (!_indicatorCache || Date.now() - _indicatorCache.at > META_CACHE_TTL_MS) {
    // Fetch up to 25,000 indicators — the API caps per_page at 32,500 in practice.
    const url = new URL(`${WB_BASE}/indicator`)
    url.searchParams.set('per_page', '25000')
    const json = await wbFetch<[unknown, WBIndicatorRaw[]]>(url)
    if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[1])) {
      throw new WorldBankApiError('World Bank /indicator returned unexpected shape', 502)
    }
    const data: WorldBankIndicator[] = json[1].map(i => ({
      id: i.id,
      name: i.name,
      unit: i.unit || undefined,
      source: i.source || { id: '', value: '' },
      sourceNote: i.sourceNote,
      sourceOrganization: i.sourceOrganization,
      topics: (i.topics || []).filter(t => t && t.id),
    }))
    _indicatorCache = { at: Date.now(), data }
  }

  let rows = _indicatorCache.data
  if (opts?.source) rows = rows.filter(r => r.source?.id === opts.source)
  if (opts?.topic) {
    const t = String(opts.topic)
    rows = rows.filter(r => (r.topics || []).some(x => x.id === t || x.value.toLowerCase().includes(t.toLowerCase())))
  }
  if (opts?.q) {
    const q = opts.q.toLowerCase()
    rows = rows.filter(r =>
      r.id.toLowerCase().includes(q) ||
      (r.name || '').toLowerCase().includes(q) ||
      (r.sourceNote || '').toLowerCase().includes(q),
    )
  }
  if (opts?.limit) rows = rows.slice(0, opts.limit)
  return rows
}

// ─────────────────────────────────────────────────────────────────────────────
// Countries (and aggregates: regions, income groups, lending categories)
// ─────────────────────────────────────────────────────────────────────────────

export interface WorldBankCountry {
  id: string             // 3-letter ISO, e.g. "USA"
  iso2Code: string       // 2-letter ISO, e.g. "US"
  name: string
  capitalCity?: string
  longitude?: string
  latitude?: string
  region: { id: string; iso2code: string; value: string }
  adminregion?: { id: string; iso2code: string; value: string }
  incomeLevel: { id: string; iso2code: string; value: string }
  lendingType?: { id: string; iso2code: string; value: string }
}

let _countryCache: { at: number; data: WorldBankCountry[] } | null = null

export async function worldbankListCountries(opts?: { q?: string; region?: string; incomeLevel?: string; limit?: number }): Promise<WorldBankCountry[]> {
  if (!_countryCache || Date.now() - _countryCache.at > META_CACHE_TTL_MS) {
    const url = new URL(`${WB_BASE}/country`)
    url.searchParams.set('per_page', '500')
    const json = await wbFetch<[unknown, WorldBankCountry[]]>(url)
    if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[1])) {
      throw new WorldBankApiError('World Bank /country returned unexpected shape', 502)
    }
    _countryCache = { at: Date.now(), data: json[1] }
  }
  let rows = _countryCache.data
  if (opts?.region) {
    const r = opts.region.toLowerCase()
    rows = rows.filter(c => c.region?.id.toLowerCase() === r || c.region?.value.toLowerCase().includes(r))
  }
  if (opts?.incomeLevel) {
    const il = opts.incomeLevel.toLowerCase()
    rows = rows.filter(c => c.incomeLevel?.id.toLowerCase() === il || c.incomeLevel?.value.toLowerCase().includes(il))
  }
  if (opts?.q) {
    const q = opts.q.toLowerCase()
    rows = rows.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.iso2Code.toLowerCase().includes(q) ||
      (c.capitalCity || '').toLowerCase().includes(q),
    )
  }
  if (opts?.limit) rows = rows.slice(0, opts.limit)
  return rows
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicator data (the actual time-series)
// ─────────────────────────────────────────────────────────────────────────────

export interface WorldBankObservation {
  countryIso3: string
  countryName: string
  indicatorId: string
  indicatorName: string
  date: string                       // year as string, e.g. "2022"
  value: number | null
  unit?: string
  obsStatus?: string
  decimal?: number
}

export interface WorldBankSeriesResult {
  source: 'worldbank'
  indicator: string
  countries: string[]
  observations: WorldBankObservation[]
  count: number
}

interface WBObservationRaw {
  indicator: { id: string; value: string }
  country: { id: string; value: string } // .id is iso2
  countryiso3code: string
  date: string
  value: number | null
  unit?: string
  obs_status?: string
  decimal?: number
}

const _seriesCache = new Map<string, { at: number; data: WorldBankSeriesResult }>()

/**
 * Fetch indicator data. Country can be:
 *   - "all" or "WLD" — world aggregate
 *   - a 2- or 3-letter ISO code, e.g. "US", "USA"
 *   - a semicolon-separated list of codes, e.g. "USA;CHN;DEU"
 *   - an aggregate code like "EUU" (European Union) or "OEC" (high-income OECD)
 */
export async function worldbankFetchSeries(opts: {
  indicator: string
  country?: string
  startYear?: number
  endYear?: number
}): Promise<WorldBankSeriesResult> {
  if (!opts.indicator) throw new Error('worldbank: indicator is required (e.g. NY.GDP.MKTP.CD)')
  const country = (opts.country || 'all').replace(/,/g, ';')
  const ck = `${country}|${opts.indicator}|${opts.startYear || ''}-${opts.endYear || ''}`
  const cached = _seriesCache.get(ck)
  if (cached && Date.now() - cached.at < DATA_CACHE_TTL_MS) return cached.data

  const url = new URL(`${WB_BASE}/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(opts.indicator)}`)
  if (opts.startYear || opts.endYear) {
    const a = opts.startYear || 1960
    const b = opts.endYear || new Date().getFullYear()
    url.searchParams.set('date', `${a}:${b}`)
  }

  const json = await wbFetch<[{ page: number; pages: number; total: number }, WBObservationRaw[] | null]>(url)
  if (!Array.isArray(json) || json.length < 2) {
    throw new WorldBankApiError('World Bank indicator series returned unexpected shape', 502)
  }
  const raw = json[1] || []
  const observations: WorldBankObservation[] = raw.map(o => ({
    countryIso3: o.countryiso3code || o.country?.id || '',
    countryName: o.country?.value || '',
    indicatorId: o.indicator?.id || opts.indicator,
    indicatorName: o.indicator?.value || '',
    date: o.date,
    value: o.value === null || o.value === undefined ? null : Number(o.value),
    unit: o.unit,
    obsStatus: o.obs_status,
    decimal: o.decimal,
  }))
  // Sort oldest-first to match how charting libs expect series.
  observations.sort((a, b) => a.date.localeCompare(b.date))

  const countries = Array.from(new Set(observations.map(o => o.countryIso3))).filter(Boolean)
  const result: WorldBankSeriesResult = {
    source: 'worldbank',
    indicator: opts.indicator,
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

export async function worldbankHealthCheck(): Promise<{ ok: boolean; error?: string }> {
  try {
    await wbFetch(new URL(`${WB_BASE}/country/USA`))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export const WORLDBANK_PROVIDER_META = {
  label: 'World Bank Open Data',
  category: 'macro' as const,
  tier: 'free' as const,
  coverage: '~1,500 development & macro indicators across 200+ countries; sources include WDI, ICP, Doing Business, etc.',
  fields: [
    'GDP', 'GDP per capita', 'population', 'inflation', 'unemployment',
    'life expectancy', 'literacy', 'FX reserves', 'gov debt/GDP',
    'business climate', 'trade flows', 'CO2 emissions',
  ],
  docs: 'https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation',
  envName: null,
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: a curated list of the most-used WB indicators so the UI &
// MCP can suggest sensible defaults (mirrors fincept-qt's "common indicators"
// list rather than copying any of its code).
// ─────────────────────────────────────────────────────────────────────────────

export const WORLDBANK_FEATURED_INDICATORS: Array<{ id: string; name: string; category: string }> = [
  { id: 'NY.GDP.MKTP.CD',      name: 'GDP (current US$)',                        category: 'Economy' },
  { id: 'NY.GDP.MKTP.KD.ZG',   name: 'GDP growth (annual %)',                    category: 'Economy' },
  { id: 'NY.GDP.PCAP.CD',      name: 'GDP per capita (current US$)',             category: 'Economy' },
  { id: 'FP.CPI.TOTL.ZG',      name: 'Inflation, consumer prices (annual %)',    category: 'Economy' },
  { id: 'SL.UEM.TOTL.ZS',      name: 'Unemployment, total (% of labor force)',   category: 'Labor' },
  { id: 'SP.POP.TOTL',         name: 'Population, total',                        category: 'Demographics' },
  { id: 'SP.DYN.LE00.IN',      name: 'Life expectancy at birth, total (years)',  category: 'Demographics' },
  { id: 'SE.ADT.LITR.ZS',      name: 'Literacy rate, adult total (% of 15+)',    category: 'Education' },
  { id: 'GC.DOD.TOTL.GD.ZS',   name: 'Central government debt, total (% of GDP)',category: 'Public Finance' },
  { id: 'BX.KLT.DINV.WD.GD.ZS',name: 'Foreign direct investment, net inflows (% of GDP)', category: 'External Sector' },
  { id: 'NE.EXP.GNFS.ZS',      name: 'Exports of goods and services (% of GDP)', category: 'Trade' },
  { id: 'NE.IMP.GNFS.ZS',      name: 'Imports of goods and services (% of GDP)', category: 'Trade' },
  { id: 'EN.ATM.CO2E.PC',      name: 'CO2 emissions (metric tons per capita)',   category: 'Environment' },
  { id: 'IC.BUS.EASE.XQ',      name: 'Ease of doing business score (0–100)',     category: 'Business Climate' },
  { id: 'FR.INR.RINR',         name: 'Real interest rate (%)',                   category: 'Monetary' },
]

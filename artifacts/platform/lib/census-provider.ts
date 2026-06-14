/**
 * U.S. Census Bureau Data API Provider
 * ────────────────────────────────────
 * Thin wrapper around the official Census Data API + Census Geocoder. Powers:
 *   - /api/census/* internal routes
 *   - /api/v1/census/* public routes
 *   - finsyt_census_* MCP tools
 *
 * Data is public; CENSUS_API_KEY is optional but strongly recommended:
 *   - Without key: ~500 calls/IP/day, often throttled.
 *   - With key:   higher per-key limits, registered usage.
 *   Sign up free: https://api.census.gov/data/key_signup.html
 *
 * Docs:
 *   - Discovery:  https://api.census.gov/data.html
 *   - Variables:  https://api.census.gov/data/{vintage}/{dataset}/variables.json
 *   - Groups:     https://api.census.gov/data/{vintage}/{dataset}/groups.json
 *   - Geocoder:   https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.pdf
 */

import { recordKeyAccepted, recordKeyMissing, recordKeyRejection } from './credential-health'

const CENSUS_BASE = 'https://api.census.gov/data'
const CENSUS_DISCOVERY = 'https://api.census.gov/data.json'
const GEOCODER_BASE = 'https://geocoding.geo.census.gov/geocoder'

const RAW_KEY = process.env.CENSUS_API_KEY || ''
/** Set to false at runtime if Census rejects the configured key. */
let _keyValid = !!RAW_KEY
/**
 * True once we have actually made a keyed call to Census in this process,
 * regardless of whether it was accepted or rejected. Until then we cannot
 * assert anything about the key — `keyAccepted` is reported as `null`
 * ("configured, not yet probed") so external monitors don't misread an
 * untested key as healthy.
 */
let _keyExercised = false
let _keyValidationLogged = false

// Initialise the credential-health surface with the static config so an
// operator hitting /api/health before any Census call still sees `missing`
// vs `unknown` correctly.
if (!RAW_KEY) {
  recordKeyMissing('census')
}

const DEFAULT_TIMEOUT_MS = 15_000

function shouldUseKey(): boolean {
  return !!RAW_KEY && _keyValid
}

function withKey(url: URL): URL {
  if (shouldUseKey()) url.searchParams.set('key', RAW_KEY)
  return url
}

/**
 * Census key mode for observability:
 *   - `keyed`             A CENSUS_API_KEY is configured and currently accepted by Census.
 *   - `keyless-fallback`  A key is configured but Census rejected it; we have silently fallen
 *                         back to keyless mode (lower rate limit). Operator action required.
 *   - `keyless`           No CENSUS_API_KEY is configured; running on the public rate limit.
 */
export type CensusKeyMode = 'keyed' | 'keyless-fallback' | 'keyless'

export function getCensusKeyMode(): CensusKeyMode {
  if (!RAW_KEY) return 'keyless'
  return _keyValid ? 'keyed' : 'keyless-fallback'
}

/** Strip the API key from a URL string before logging or returning to clients. */
export function redactCensusKey(s: string): string {
  return s.replace(/([?&])key=[^&]+/g, '$1key=REDACTED')
}

/**
 * Typed error for Census upstream failures. The `httpStatus` field is the
 * HTTP code the route handler should surface to its caller — 502 for hard
 * upstream errors, 503 for rate-limits / clean exhaustion / WAF throttle pages,
 * 504 for upstream timeouts.
 */
export class CensusApiError extends Error {
  httpStatus: number
  constructor(message: string, httpStatus: number) {
    super(message)
    this.name = 'CensusApiError'
    this.httpStatus = httpStatus
  }
}

/**
 * Census API behavior with an invalid key:
 *   HTTP 302  Location: https://api.census.gov/data/invalid_key.html
 *             X-DataWebAPI-KeyError: 1
 * Default fetch follows the redirect and the HTML page is what the caller sees.
 * We detect this cheaply with `redirect: 'manual'` and surface a clean fallback.
 */
async function censusFetch<T = unknown>(url: URL, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    try {
      return await censusFetchInner<T>(url, init, controller)
    } catch (e) {
      // AbortError → clean 504 (upstream timeout) so the route can map it.
      const err = e as Error & { name?: string }
      if (err && (err.name === 'AbortError' || /aborted/i.test(err.message || ''))) {
        throw new CensusApiError(`Census API timeout after ${DEFAULT_TIMEOUT_MS}ms (url=${redactCensusKey(url.toString())})`, 504)
      }
      throw e
    }
  } finally {
    clearTimeout(timer)
  }
}

async function censusFetchInner<T = unknown>(url: URL, init: RequestInit | undefined, controller: AbortController): Promise<T> {
  const doFetch = (target: URL) => fetch(target.toString(), {
      ...init,
      signal: controller.signal,
      redirect: 'manual',
      headers: { Accept: 'application/json', 'User-Agent': 'Finsyt/1.0 (+https://finsyt.com)', ...(init?.headers || {}) },
    })

    let r = await doFetch(url)

    // Detect invalid-key redirect → mark key invalid, retry once without it.
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location') || ''
      const keyErr = r.headers.get('x-datawebapi-keyerror') === '1'
      if ((keyErr || loc.includes('invalid_key')) && url.searchParams.has('key')) {
        if (!_keyValidationLogged) {
           
          console.warn('[census] CENSUS_API_KEY rejected by Census Bureau API — falling back to keyless mode (lower rate limit). Get a valid key at https://api.census.gov/data/key_signup.html')
          _keyValidationLogged = true
        }
        _keyValid = false
        _keyExercised = true
        // Surface the silent fallback to the credential-health registry so it
        // shows up in /api/health and as a structured error log (instead of
        // the previous one-shot stdout warning that was easy to miss).
        recordKeyRejection(
          'census',
          `Census API rejected CENSUS_API_KEY (HTTP ${r.status}, x-datawebapi-keyerror=${keyErr ? '1' : '0'}); falling back to keyless mode.`,
        )
        const retry = new URL(url.toString())
        retry.searchParams.delete('key')
        r = await doFetch(retry)
      } else if (loc) {
        // Follow other (legitimate) redirects manually, once.
        r = await doFetch(new URL(loc, url))
      }
    }

    if (!r.ok) {
      const body = await r.text().catch(() => '')
      // 429 (rate-limit) and upstream 5xx are mapped to clean-exhaustion (503) at the route layer.
      const isThrottle = r.status === 429 || r.status === 503 || r.status === 504
      throw new CensusApiError(
        `Census API ${r.status}: ${body.slice(0, 240)} (url=${redactCensusKey(url.toString())})`,
        isThrottle ? 503 : 502,
      )
    }

    const ct = r.headers.get('content-type') || ''
    const txt = await r.text()
    if (txt.startsWith('<') || txt.includes('<html')) {
      // Census serves an HTML throttle/block page when the client is rate-limited
      // or the upstream WAF intercepts the call — surface as clean exhaustion.
      throw new CensusApiError(
        `Census API returned HTML instead of JSON (likely throttled or blocked); url=${redactCensusKey(url.toString())}`,
        503,
      )
    }
    if (ct.includes('application/json') || ct.includes('text/json') || txt.startsWith('[') || txt.startsWith('{')) {
      // A successful response that *actually carried the key* confirms the
      // key still works, so record acceptance. Discovery / keyless probes
      // (e.g. censusHealthCheck) do not carry the key and must NOT bump the
      // exercised flag — otherwise we'd misreport an untested key as accepted.
      if (RAW_KEY && url.searchParams.has('key')) {
        _keyExercised = true
        recordKeyAccepted('census')
      }
      return JSON.parse(txt) as T
    }
  throw new CensusApiError(
    `Census API unexpected content-type "${ct}"; first 120 chars: ${txt.slice(0, 120)}`,
    502,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog / discovery
// ─────────────────────────────────────────────────────────────────────────────

export interface CensusDataset {
  title: string
  description: string
  identifier: string
  c_dataset: string[]
  c_vintage?: number
  c_isAggregate?: boolean
  c_isAvailable?: boolean
  distribution?: { accessURL?: string; format?: string }[]
}

interface CensusDiscoveryResponse {
  dataset: CensusDataset[]
}

let _datasetCache: { at: number; data: CensusDataset[] } | null = null
const DATASET_CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6h

/** Full Census dataset catalog (cached 6h). */
export async function censusListDatasets(opts?: { vintage?: number; q?: string; limit?: number }): Promise<CensusDataset[]> {
  if (!_datasetCache || Date.now() - _datasetCache.at > DATASET_CACHE_TTL_MS) {
    const json = await censusFetch<CensusDiscoveryResponse>(new URL(CENSUS_DISCOVERY))
    _datasetCache = { at: Date.now(), data: json.dataset || [] }
  }
  let rows = _datasetCache.data
  if (opts?.vintage) rows = rows.filter(d => d.c_vintage === opts.vintage)
  if (opts?.q) {
    const q = opts.q.toLowerCase()
    rows = rows.filter(d =>
      (d.title || '').toLowerCase().includes(q) ||
      (d.description || '').toLowerCase().includes(q) ||
      (d.c_dataset || []).join('/').toLowerCase().includes(q),
    )
  }
  if (opts?.limit) rows = rows.slice(0, opts.limit)
  return rows
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate data fetch
// ─────────────────────────────────────────────────────────────────────────────

export interface CensusAggregateOptions {
  /** Path segments after /data/{vintage}, e.g. "acs/acs5" or "dec/pl". */
  dataset: string
  /** Year, e.g. 2022. */
  vintage: number
  /** Variables to fetch, e.g. ["NAME", "B01003_001E"]. */
  get: string[]
  /** "for" clause, e.g. "county:*" or "state:48". */
  for: string
  /** Optional "in" clause, e.g. "state:48". Multiple parents joined by " ". */
  in?: string
  /** UCGID (Uniform Census Geography ID) clause, alternative to for/in. */
  ucgid?: string
}

export interface CensusAggregateRow {
  /** Header → value map for one row. */
  [variable: string]: string
}

export interface CensusAggregateResult {
  source: 'census'
  dataset: string
  vintage: number
  variables: string[]
  rows: CensusAggregateRow[]
  rowCount: number
  /** Whether this call used the configured CENSUS_API_KEY ('keyed') or the public-rate-limit fallback. */
  keyMode: CensusKeyMode
}

/**
 * Fetch aggregate Census data. Returns an array-of-objects shape (header
 * row from Census is unflattened into key/value pairs per row).
 */
export async function censusFetchAggregate(opts: CensusAggregateOptions): Promise<CensusAggregateResult> {
  if (!opts.dataset) throw new Error('census: dataset is required (e.g. "acs/acs5")')
  if (!opts.vintage) throw new Error('census: vintage (year) is required')
  if (!opts.get?.length) throw new Error('census: at least one variable in "get" is required')
  if (!opts.for && !opts.ucgid) throw new Error('census: "for" or "ucgid" clause is required')

  const url = new URL(`${CENSUS_BASE}/${opts.vintage}/${opts.dataset}`)
  url.searchParams.set('get', opts.get.join(','))
  if (opts.ucgid) url.searchParams.set('ucgid', opts.ucgid)
  else {
    url.searchParams.set('for', opts.for)
    if (opts.in) url.searchParams.set('in', opts.in)
  }
  withKey(url)

  // Census API returns [["header1","header2",...], ["val","val",...], ...]
  const raw = await censusFetch<string[][]>(url)
  if (!Array.isArray(raw) || raw.length === 0) {
    return { source: 'census', dataset: opts.dataset, vintage: opts.vintage, variables: opts.get, rows: [], rowCount: 0, keyMode: getCensusKeyMode() }
  }
  const [header, ...data] = raw
  const rows: CensusAggregateRow[] = data.map(row => {
    const obj: CensusAggregateRow = {}
    header.forEach((h, i) => { obj[h] = row[i] })
    return obj
  })

  return {
    source: 'census',
    dataset: opts.dataset,
    vintage: opts.vintage,
    variables: header,
    rows,
    rowCount: rows.length,
    keyMode: getCensusKeyMode(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Variables / groups (table search)
// ─────────────────────────────────────────────────────────────────────────────

export interface CensusVariable {
  name: string
  label: string
  concept?: string
  predicateType?: string
  group?: string
  attributes?: string
}

export interface CensusGroup {
  name: string
  description: string
  variables?: string
}

const _variablesCache = new Map<string, { at: number; data: CensusVariable[] }>()
const _groupsCache = new Map<string, { at: number; data: CensusGroup[] }>()
const META_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h

function metaCacheKey(vintage: number, dataset: string): string {
  return `${vintage}:${dataset}`
}

/** List all variables in a dataset (e.g. ACS5 2022). Cached 24h. */
export async function censusListVariables(vintage: number, dataset: string, opts?: { q?: string; group?: string; limit?: number }): Promise<CensusVariable[]> {
  const ck = metaCacheKey(vintage, dataset)
  let cached = _variablesCache.get(ck)
  if (!cached || Date.now() - cached.at > META_CACHE_TTL_MS) {
    const json = await censusFetch<{ variables: Record<string, Omit<CensusVariable, 'name'>> }>(new URL(`${CENSUS_BASE}/${vintage}/${dataset}/variables.json`))
    const data: CensusVariable[] = Object.entries(json.variables || {}).map(([name, v]) => ({ name, ...v }))
    cached = { at: Date.now(), data }
    _variablesCache.set(ck, cached)
  }
  let rows = cached.data
  if (opts?.group) rows = rows.filter(v => v.group === opts.group)
  if (opts?.q) {
    const q = opts.q.toLowerCase()
    rows = rows.filter(v =>
      (v.label || '').toLowerCase().includes(q) ||
      (v.concept || '').toLowerCase().includes(q) ||
      v.name.toLowerCase().includes(q),
    )
  }
  if (opts?.limit) rows = rows.slice(0, opts.limit)
  return rows
}

/** List all variable groups (i.e. tables) in a dataset. Cached 24h. */
export async function censusListGroups(vintage: number, dataset: string, opts?: { q?: string; limit?: number }): Promise<CensusGroup[]> {
  const ck = metaCacheKey(vintage, dataset)
  let cached = _groupsCache.get(ck)
  if (!cached || Date.now() - cached.at > META_CACHE_TTL_MS) {
    const json = await censusFetch<{ groups: CensusGroup[] }>(new URL(`${CENSUS_BASE}/${vintage}/${dataset}/groups.json`))
    cached = { at: Date.now(), data: json.groups || [] }
    _groupsCache.set(ck, cached)
  }
  let rows = cached.data
  if (opts?.q) {
    const q = opts.q.toLowerCase()
    rows = rows.filter(g =>
      (g.description || '').toLowerCase().includes(q) ||
      g.name.toLowerCase().includes(q),
    )
  }
  if (opts?.limit) rows = rows.slice(0, opts.limit)
  return rows
}

// ─────────────────────────────────────────────────────────────────────────────
// Geocoder (place name → FIPS)
// ─────────────────────────────────────────────────────────────────────────────

export interface CensusFipsResult {
  matchedAddress?: string
  coordinates?: { x: number; y: number }
  geographies: Array<{
    name: string
    geoLevel: string
    state?: string
    county?: string
    tract?: string
    block?: string
    place?: string
    cbsa?: string
    /** Raw GEOID for the matched geography. */
    geoid?: string
  }>
}

interface RawCensusGeocoderResponse {
  result?: {
    addressMatches?: Array<{
      matchedAddress: string
      coordinates: { x: number; y: number }
      geographies: Record<string, Array<Record<string, string>>>
    }>
  }
}

/**
 * Resolve a place name or address to FIPS codes via the Census Geocoder.
 * Useful for converting "Travis County, TX" → state=48 & county=453 etc.
 */
export async function censusResolveFips(address: string, opts?: { benchmark?: string; vintage?: string }): Promise<CensusFipsResult> {
  if (!address?.trim()) throw new Error('census: address is required')
  const url = new URL(`${GEOCODER_BASE}/geographies/onelineaddress`)
  url.searchParams.set('address', address)
  url.searchParams.set('benchmark', opts?.benchmark || 'Public_AR_Current')
  url.searchParams.set('vintage', opts?.vintage || 'Current_Current')
  url.searchParams.set('format', 'json')

  const json = await censusFetch<RawCensusGeocoderResponse>(url)
  const match = json.result?.addressMatches?.[0]
  if (!match) return { geographies: [] }

  const geos: CensusFipsResult['geographies'] = []
  for (const [level, arr] of Object.entries(match.geographies || {})) {
    for (const g of arr) {
      geos.push({
        name: g['NAME'] || g['BASENAME'] || level,
        geoLevel: level,
        state: g['STATE'],
        county: g['COUNTY'],
        tract: g['TRACT'],
        block: g['BLOCK'],
        place: g['PLACE'],
        cbsa: g['CBSA'],
        geoid: g['GEOID'],
      })
    }
  }

  return {
    matchedAddress: match.matchedAddress,
    coordinates: match.coordinates,
    geographies: geos,
  }
}

/**
 * Provider health check. Returns:
 *   - `ok`           — upstream Census API was reachable on this probe.
 *   - `hasKey`       — a CENSUS_API_KEY is configured at all (env var is set).
 *   - `keyAccepted`  — the configured key has not been rejected by Census this
 *                     process. `null` when there is no key to evaluate, or
 *                     when the key has not yet been exercised. An external
 *                     monitor can distinguish:
 *                        hasKey=false                  → operator chose keyless mode
 *                        hasKey=true,  keyAccepted=true  → healthy
 *                        hasKey=true,  keyAccepted=false → silent fallback — rotate the key
 *                        hasKey=true,  keyAccepted=null  → key configured, not yet probed
 *   - `keyMode`      — semantic alias of the (hasKey, keyAccepted) tuple.
 */
export async function censusHealthCheck(): Promise<{
  ok: boolean
  hasKey: boolean
  keyAccepted: boolean | null
  keyMode: CensusKeyMode
  error?: string
}> {
  // `keyAccepted` is tri-state:
  //   null   → no key configured, OR a key is configured but no keyed call
  //            has happened yet this process (so we cannot truthfully claim it
  //            was accepted just because the env var is non-empty).
  //   true   → the most recent keyed call to Census was accepted.
  //   false  → Census rejected the key (we have silently fallen back to
  //            keyless mode and are now on the public rate limit).
  const keyAccepted: boolean | null = !RAW_KEY ? null : (_keyExercised ? _keyValid : null)
  try {
    await censusFetch(new URL(CENSUS_DISCOVERY))
    // Note: the discovery endpoint doesn't carry the key, so this probe
    // confirms upstream reachability but doesn't re-validate the key. We
    // therefore report the most recent runtime knowledge of the key.
    return {
      ok: true,
      hasKey: !!RAW_KEY,
      keyAccepted,
      keyMode: getCensusKeyMode(),
    }
  } catch (e) {
    return {
      ok: false,
      hasKey: !!RAW_KEY,
      keyAccepted,
      keyMode: getCensusKeyMode(),
      error: (e as Error).message,
    }
  }
}

export const CENSUS_PROVIDER_META = {
  label: 'U.S. Census Bureau',
  category: 'macro' as const,
  tier: 'specialty' as const,
  coverage: 'Decennial census, ACS 1/5-year, Economic Census, population estimates — geography from US down to block level',
  fields: [
    'population', 'demographics', 'income', 'poverty', 'employment',
    'housing', 'education', 'commuting', 'industry', 'business patterns',
    'FIPS resolution', 'TIGER geographies',
  ],
  docs: 'https://www.census.gov/data/developers.html',
  envName: 'CENSUS_API_KEY',
}

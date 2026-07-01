/**
 * Fixed Income & Rates Desk (Task #405)
 *
 * Server-side data layer for the Finsyt Fixed Income & Rates Desk:
 *   - Government yield curve (1M–30Y) for a given date, with historical
 *     snapshots / date comparison.
 *   - Reference-rates board (SOFR, EFFR, SONIA, €STR).
 *   - Credit spreads (Investment Grade vs High Yield OAS).
 *
 * The Treasury curve CONSUMES the existing multi-asset rate resolution
 * (`classifySymbol` → `resolveMultiAssetQuote` / `resolveMultiAssetHistory`)
 * rather than re-implementing the FRED→Yahoo waterfall. Reference rates and
 * credit spreads have no entry in that catalog, so they go through the
 * existing FRED provider (`fredFetch`, which carries credential-health), and
 * fall back to the keyless public FRED CSV endpoint (`fredgraph.csv`) so the
 * desk degrades to free macro data when no FRED key is configured.
 *
 * Every returned series carries a `source` attribution string
 * (`fred` | `fred-public` | `yahoo` | … | `none`).
 */
import { classifySymbol, rateKeys } from './asset-class'
import { resolveMultiAssetQuote, resolveMultiAssetHistory } from './multi-asset'
import { PROVIDERS, fredFetch } from './data-providers'

// ── Types ────────────────────────────────────────────────────────────────────
export interface CurvePoint {
  tenor: string
  symbol: string
  months: number
  yield: number | null
  source: string
  asOf?: string
}
export interface YieldCurve {
  date: string | null
  asOf: string | null
  points: CurvePoint[]
  spreads: { label: string; key: string; value: number | null }[]
  source: string
}
export interface ReferenceRate {
  key: string
  label: string
  name: string
  region: string
  value: number | null
  prev: number | null
  change: number | null
  asOf?: string
  source: string
  spark: { date: string; value: number }[]
}
export interface CreditSpreadSeries {
  latest: { key: string; label: string; name: string; value: number | null; prev: number | null; change: number | null; asOf?: string; source: string }[]
  history: { date: string; ig: number | null; hy: number | null }[]
  differential: number | null
  source: string
}

// Tenor → months for x-axis spacing and ordering.
const TENOR_MONTHS: Record<string, number> = {
  US1M: 1, US3M: 3, US6M: 6, US1Y: 12, US2Y: 24, US3Y: 36,
  US5Y: 60, US7Y: 84, US10Y: 120, US20Y: 240, US30Y: 360,
}

type Obs = { date: string; value: number }

// ── Keyless public FRED CSV (fredgraph.csv — no API key required) ─────────────
async function fredCsv(seriesId: string): Promise<Obs[]> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`FRED CSV ${seriesId} HTTP ${res.status}`)
  const text = await res.text()
  const out: Obs[] = []
  for (const line of text.split('\n')) {
    const idx = line.indexOf(',')
    if (idx < 0) continue
    const date = line.slice(0, idx).trim()
    const raw = line.slice(idx + 1).trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (!raw || raw === '.') continue
    const v = parseFloat(raw)
    if (Number.isFinite(v)) out.push({ date, value: v })
  }
  return out
}

// ── Keyed FRED observations (credential-health via fredFetch) ─────────────────
async function fredKeyed(seriesId: string, params: Record<string, string>): Promise<Obs[] | null> {
  if (!PROVIDERS.fred) return null
  try {
    const data = await fredFetch('/fred/series/observations', { series_id: seriesId, ...params })
    const obs: Obs[] = (data?.observations || [])
      .filter((o: any) => o.value && o.value !== '.')
      .map((o: any) => ({ date: o.date, value: parseFloat(o.value) }))
      .filter((o: Obs) => Number.isFinite(o.value))
    return obs
  } catch {
    return null
  }
}

interface FredOpts { limit?: number; start?: string; end?: string; order?: 'asc' | 'desc' }

/**
 * Fetch a FRED series with source attribution: keyed FRED first (records
 * credential-health), keyless public CSV fallback. Returns ascending-by-date
 * observations regardless of requested order so callers can index uniformly.
 */
async function fredSeries(seriesId: string, opts: FredOpts = {}): Promise<{ obs: Obs[]; source: string } | null> {
  const order = opts.order || 'desc'
  const keyedParams: Record<string, string> = { sort_order: order }
  if (opts.limit) keyedParams.limit = String(opts.limit)
  if (opts.start) keyedParams.observation_start = opts.start
  if (opts.end) keyedParams.observation_end = opts.end

  const keyed = await fredKeyed(seriesId, keyedParams)
  if (keyed && keyed.length) {
    const asc = keyed.slice().sort((a, b) => a.date.localeCompare(b.date))
    return { obs: asc, source: 'fred' }
  }

  try {
    let obs = await fredCsv(seriesId)
    if (opts.start) obs = obs.filter(o => o.date >= opts.start!)
    if (opts.end) obs = obs.filter(o => o.date <= opts.end!)
    if (opts.limit && obs.length > opts.limit) obs = obs.slice(obs.length - opts.limit)
    if (obs.length) return { obs, source: 'fred-public' }
  } catch {
    /* keyless source unavailable */
  }
  return null
}

function round(n: number, d = 2): number {
  const f = Math.pow(10, d)
  return Math.round(n * f) / f
}

function isoMinusDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function dominantSource(sources: string[]): string {
  const counts = new Map<string, number>()
  for (const s of sources) {
    if (!s || s === 'none') continue
    counts.set(s, (counts.get(s) || 0) + 1)
  }
  let best = 'none'
  let max = 0
  for (const [s, c] of counts) if (c > max) { max = c; best = s }
  return best
}

// ── Yield curve ───────────────────────────────────────────────────────────────
/**
 * Build the government yield curve. When `date` is null the latest available
 * yield per tenor is used (via `resolveMultiAssetQuote`). When `date` is set a
 * historical snapshot is assembled (last observation on/before that date via
 * `resolveMultiAssetHistory`). Either path falls back to the keyless public
 * FRED CSV for tenors the multi-asset resolution can't cover (e.g. no FRED key
 * and no Yahoo alias).
 */
export async function getYieldCurve(date?: string | null): Promise<YieldCurve> {
  const keys = rateKeys()
  const points = await Promise.all(keys.map(async (key): Promise<CurvePoint> => {
    const c = classifySymbol(key)
    const months = TENOR_MONTHS[key] ?? 0
    const tenor = key.replace(/^US/, '')

    if (!date) {
      const q = await resolveMultiAssetQuote(c)
      if (q && q.yield != null) {
        return { tenor, symbol: key, months, yield: round(q.yield, 2), source: q.source, asOf: q.asOf?.slice(0, 10) }
      }
      const pub = c.fred ? await fredSeries(c.fred, { limit: 1, order: 'desc' }) : null
      if (pub && pub.obs.length) {
        const last = pub.obs[pub.obs.length - 1]
        return { tenor, symbol: key, months, yield: round(last.value, 2), source: pub.source, asOf: last.date }
      }
      return { tenor, symbol: key, months, yield: null, source: 'none' }
    }

    const start = isoMinusDays(date, 14)
    const hist = await resolveMultiAssetHistory(c, start, date)
    const bar = hist?.bars?.length ? hist.bars[hist.bars.length - 1] : null
    if (bar && bar.c != null) {
      return { tenor, symbol: key, months, yield: round(bar.c, 2), source: hist!.source, asOf: new Date(bar.t).toISOString().slice(0, 10) }
    }
    const pub = c.fred ? await fredSeries(c.fred, { start, end: date, order: 'asc' }) : null
    if (pub && pub.obs.length) {
      const last = pub.obs[pub.obs.length - 1]
      return { tenor, symbol: key, months, yield: round(last.value, 2), source: pub.source, asOf: last.date }
    }
    return { tenor, symbol: key, months, yield: null, source: 'none' }
  }))

  const yieldOf = (sym: string) => points.find(p => p.symbol === sym)?.yield ?? null
  const spread = (a: string, b: string): number | null => {
    const ya = yieldOf(a), yb = yieldOf(b)
    return ya != null && yb != null ? round(ya - yb, 2) : null
  }
  const spreads = [
    { label: '2s10s (10Y − 2Y)', key: '2s10s', value: spread('US10Y', 'US2Y') },
    { label: '3m10y (10Y − 3M)', key: '3m10y', value: spread('US10Y', 'US3M') },
    { label: '5s30s (30Y − 5Y)', key: '5s30s', value: spread('US30Y', 'US5Y') },
  ]

  const asOf = points.map(p => p.asOf).filter(Boolean).sort().pop() || null
  return { date: date || null, asOf, points, spreads, source: dominantSource(points.map(p => p.source)) }
}

// ── Reference rates board ─────────────────────────────────────────────────────
const REFERENCE_RATES: { key: string; label: string; name: string; region: string; series: string }[] = [
  { key: 'SOFR',  label: 'SOFR',  name: 'Secured Overnight Financing Rate',  region: 'US', series: 'SOFR' },
  { key: 'EFFR',  label: 'EFFR',  name: 'Effective Federal Funds Rate',       region: 'US', series: 'EFFR' },
  { key: 'SONIA', label: 'SONIA', name: 'Sterling Overnight Index Average',   region: 'UK', series: 'IUDSOIA' },
  { key: 'ESTR',  label: '€STR',  name: 'Euro Short-Term Rate',              region: 'EU', series: 'ECBESTRVOLWGTTRMDMNRT' },
]

export async function getReferenceRates(): Promise<{ rates: ReferenceRate[]; source: string }> {
  const rates = await Promise.all(REFERENCE_RATES.map(async (r): Promise<ReferenceRate> => {
    const res = await fredSeries(r.series, { limit: 60, order: 'desc' })
    if (!res || !res.obs.length) {
      return { key: r.key, label: r.label, name: r.name, region: r.region, value: null, prev: null, change: null, source: 'none', spark: [] }
    }
    const obs = res.obs // ascending
    const last = obs[obs.length - 1]
    const prev = obs.length > 1 ? obs[obs.length - 2] : null
    return {
      key: r.key, label: r.label, name: r.name, region: r.region,
      value: round(last.value, 3),
      prev: prev ? round(prev.value, 3) : null,
      change: prev ? round(last.value - prev.value, 3) : null,
      asOf: last.date,
      source: res.source,
      spark: obs.slice(-30).map(o => ({ date: o.date, value: o.value })),
    }
  }))
  return { rates, source: dominantSource(rates.map(r => r.source)) }
}

// ── Credit spreads (IG vs HY OAS) ─────────────────────────────────────────────
const CREDIT_SERIES: { key: string; label: string; name: string; series: string }[] = [
  { key: 'IG', label: 'Investment Grade', name: 'ICE BofA US Corporate Index OAS',  series: 'BAMLC0A0CM' },
  { key: 'HY', label: 'High Yield',       name: 'ICE BofA US High Yield Index OAS', series: 'BAMLH0A0HYM2' },
]

export async function getCreditSpreads(periods = 365): Promise<CreditSpreadSeries> {
  const start = isoMinusDays(new Date().toISOString().slice(0, 10), periods)
  const [ig, hy] = await Promise.all(
    CREDIT_SERIES.map(s => fredSeries(s.series, { start, order: 'asc' }).then(r => ({ meta: s, res: r })))
  )

  const buildLatest = (entry: { meta: typeof CREDIT_SERIES[number]; res: { obs: Obs[]; source: string } | null }) => {
    const { meta, res } = entry
    if (!res || !res.obs.length) {
      return { key: meta.key, label: meta.label, name: meta.name, value: null, prev: null, change: null, source: 'none' }
    }
    const obs = res.obs
    const last = obs[obs.length - 1]
    const prev = obs.length > 1 ? obs[obs.length - 2] : null
    return {
      key: meta.key, label: meta.label, name: meta.name,
      value: round(last.value, 2),
      prev: prev ? round(prev.value, 2) : null,
      change: prev ? round(last.value - prev.value, 2) : null,
      asOf: last.date,
      source: res.source,
    }
  }

  const latest = [buildLatest(ig), buildLatest(hy)]

  // Merge by date for the comparison chart.
  const byDate = new Map<string, { date: string; ig: number | null; hy: number | null }>()
  for (const o of ig.res?.obs || []) byDate.set(o.date, { date: o.date, ig: round(o.value, 2), hy: null })
  for (const o of hy.res?.obs || []) {
    const row = byDate.get(o.date)
    if (row) row.hy = round(o.value, 2)
    else byDate.set(o.date, { date: o.date, ig: null, hy: round(o.value, 2) })
  }
  const history = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))

  const igLatest = latest[0].value
  const hyLatest = latest[1].value
  const differential = igLatest != null && hyLatest != null ? round(hyLatest - igLatest, 2) : null

  return { latest, history, differential, source: dominantSource(latest.map(l => l.source)) }
}

/**
 * Positioning & Regulatory Desk provider (Task #410)
 * ──────────────────────────────────────────────────
 * Read-only, keyless public-data adapters that back the Positioning &
 * Regulatory Desk:
 *
 *   - CFTC Commitment of Traders (COT) — the public Socrata "Public
 *     Reporting" API (publicreporting.cftc.gov). Legacy futures-only
 *     report, commercial vs non-commercial net positioning per market.
 *   - FINRA daily short-sale volume — the public CDN files at
 *     cdn.finra.org/equity/regsho/daily. Per-symbol short volume, short
 *     volume as a % of total reported volume, and a multi-day trend.
 *   - SEC fails-to-deliver (FTD) — the public semi-monthly ZIP files at
 *     sec.gov/files/data/fails-deliver-data. Best-effort: the most recent
 *     available period is parsed for the symbol; absence degrades to an
 *     honest empty value rather than an error.
 *   - SEC regulator lookup — the public company_tickers.json map for
 *     CIK ⇆ symbol resolution and name search.
 *
 * Every public source records credential-health accept/reject so the admin
 * Provider Health surface can observe upstream availability, and every
 * exported result carries a `source` attribution string. No keys, no auth,
 * no trading, no predictive modelling.
 */
import { z } from 'zod'
import JSZip from 'jszip'
import { recordKeyAccepted, recordKeyRejection } from './credential-health'

const UA = 'Finsyt Positioning Desk contact@finsyt.dev'

// ── CFTC Commitment of Traders ───────────────────────────────────────────────

const CFTC_BASE = 'https://publicreporting.cftc.gov/resource'
// Legacy "Futures-Only" report dataset — the most widely-cited COT series.
const CFTC_DATASET = '6dca-aqww'
// COT is published weekly (Friday for the prior Tuesday), so a long cache is
// safe; we revalidate every 6h to pick up the weekly drop without hammering.
const CFTC_REVALIDATE = 21600

/** A curated, stable catalog of CFTC contract markets for the picker. */
export interface CotMarket {
  /** Stable CFTC contract market code (the API filter key). */
  code: string
  /** Short display label. */
  label: string
  /** Grouping for the picker. */
  group: 'Equity Index' | 'Rates' | 'Metals' | 'Energy' | 'Currencies' | 'Agriculture' | 'Crypto'
}

export const COT_MARKETS: CotMarket[] = [
  { code: '13874A', label: 'E-mini S&P 500',     group: 'Equity Index' },
  { code: '209742', label: 'E-mini Nasdaq-100',  group: 'Equity Index' },
  { code: '1170E1', label: 'VIX Futures',        group: 'Equity Index' },
  { code: '043602', label: '10-Year T-Note',     group: 'Rates' },
  { code: '042601', label: '2-Year T-Note',      group: 'Rates' },
  { code: '020601', label: 'Ultra T-Bond',       group: 'Rates' },
  { code: '088691', label: 'Gold',               group: 'Metals' },
  { code: '084691', label: 'Silver',             group: 'Metals' },
  { code: '085692', label: 'Copper',             group: 'Metals' },
  { code: '076651', label: 'Platinum',           group: 'Metals' },
  { code: '067651', label: 'WTI Crude Oil',      group: 'Energy' },
  { code: '023651', label: 'Natural Gas',        group: 'Energy' },
  { code: '022651', label: 'RBOB Gasoline',      group: 'Energy' },
  { code: '099741', label: 'Euro FX',            group: 'Currencies' },
  { code: '097741', label: 'Japanese Yen',       group: 'Currencies' },
  { code: '096742', label: 'British Pound',      group: 'Currencies' },
  { code: '090741', label: 'Canadian Dollar',    group: 'Currencies' },
  { code: '232741', label: 'Australian Dollar',  group: 'Currencies' },
  { code: '002602', label: 'Corn',               group: 'Agriculture' },
  { code: '001602', label: 'Wheat (Chicago SRW)',group: 'Agriculture' },
  { code: '005602', label: 'Soybeans',           group: 'Agriculture' },
  { code: '133741', label: 'Bitcoin',            group: 'Crypto' },
]

const COT_MARKET_BY_CODE = new Map(COT_MARKETS.map(m => [m.code, m]))

/** Resolve a user-supplied market token (code or fuzzy label) to a catalog entry. */
export function resolveCotMarket(token: string): CotMarket | null {
  const t = (token || '').trim()
  if (!t) return null
  if (COT_MARKET_BY_CODE.has(t)) return COT_MARKET_BY_CODE.get(t)!
  const lower = t.toLowerCase()
  return (
    COT_MARKETS.find(m => m.label.toLowerCase() === lower) ||
    COT_MARKETS.find(m => m.label.toLowerCase().includes(lower)) ||
    null
  )
}

export const CotLegSchema = z.object({
  long: z.number(),
  short: z.number(),
  net: z.number(),
})
export type CotLeg = z.infer<typeof CotLegSchema>

export const CotReportSchema = z.object({
  /** Report date (the Tuesday the snapshot reflects), ISO YYYY-MM-DD. */
  date: z.string(),
  openInterest: z.number().nullable(),
  noncommercial: CotLegSchema,
  commercial: CotLegSchema,
  nonreportable: CotLegSchema,
})
export type CotReport = z.infer<typeof CotReportSchema>

export interface CotResult {
  market: { code: string; label: string; name: string | null }
  reports: CotReport[]
  latest: CotReport | null
  count: number
  source: string
  providerError: string | null
  fetchedAt: string
}

function num(v: unknown): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[, ]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function leg(long: unknown, short: unknown): CotLeg {
  const l = num(long)
  const s = num(short)
  return { long: l, short: s, net: l - s }
}

function isoDate(v: unknown): string {
  const s = String(v || '')
  // Socrata returns floating timestamps like "2024-05-21T00:00:00.000"
  return s.length >= 10 ? s.slice(0, 10) : s
}

/**
 * Fetch the most recent `weeks` Commitment-of-Traders reports for a single
 * CFTC contract market. Returns chronological (oldest → newest) reports so
 * the chart can render left-to-right.
 */
export async function getCotReport(marketToken: string, weeks = 52): Promise<CotResult> {
  const fetchedAt = new Date().toISOString()
  const market = resolveCotMarket(marketToken) || COT_MARKETS[0]
  const limit = Math.min(Math.max(weeks, 1), 260)

  const url =
    `${CFTC_BASE}/${CFTC_DATASET}.json` +
    `?cftc_contract_market_code=${encodeURIComponent(market.code)}` +
    `&$order=report_date_as_yyyy_mm_dd DESC&$limit=${limit}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      next: { revalidate: CFTC_REVALIDATE },
    })
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) recordKeyRejection('cftc', `CFTC HTTP ${res.status}`)
      throw new Error(`CFTC HTTP ${res.status}`)
    }
    recordKeyAccepted('cftc')
    const rows = (await res.json()) as any[]
    const name = rows.length ? String(rows[0].market_and_exchange_names || '').trim() || null : null

    const reports: CotReport[] = rows
      .map(r => ({
        date: isoDate(r.report_date_as_yyyy_mm_dd),
        openInterest: r.open_interest_all != null ? num(r.open_interest_all) : null,
        noncommercial: leg(r.noncomm_positions_long_all, r.noncomm_positions_short_all),
        commercial: leg(r.comm_positions_long_all, r.comm_positions_short_all),
        nonreportable: leg(r.nonrept_positions_long_all, r.nonrept_positions_short_all),
      }))
      .filter(r => r.date)
      // API returns newest-first; flip to chronological for charting.
      .reverse()

    return {
      market: { code: market.code, label: market.label, name },
      reports,
      latest: reports.length ? reports[reports.length - 1] : null,
      count: reports.length,
      source: reports.length ? 'CFTC Commitment of Traders' : 'none',
      providerError: null,
      fetchedAt,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      market: { code: market.code, label: market.label, name: null },
      reports: [],
      latest: null,
      count: 0,
      source: 'none',
      providerError: message,
      fetchedAt,
    }
  }
}

// ── FINRA daily short-sale volume + SEC fails-to-deliver ──────────────────────

const FINRA_BASE = 'https://cdn.finra.org/equity/regsho/daily'
const FINRA_REVALIDATE = 21600

export const ShortVolumeDaySchema = z.object({
  date: z.string(),
  shortVolume: z.number(),
  shortExemptVolume: z.number(),
  totalVolume: z.number(),
  /** Short volume as a fraction (0..1) of total reported volume. */
  shortPct: z.number().nullable(),
})
export type ShortVolumeDay = z.infer<typeof ShortVolumeDaySchema>

export const FtdRecordSchema = z.object({
  date: z.string(),
  quantity: z.number(),
  price: z.number().nullable(),
})
export type FtdRecord = z.infer<typeof FtdRecordSchema>

export interface ShortPositioningResult {
  symbol: string
  shortVolume: ShortVolumeDay[]
  latest: ShortVolumeDay | null
  /** Average short% over the returned window. */
  avgShortPct: number | null
  ftd: FtdRecord[]
  latestFtd: FtdRecord | null
  source: string
  providerError: string | null
  fetchedAt: string
}

function yyyymmdd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * Parse one FINRA CNMS daily short-volume file (pipe-delimited) for a single
 * symbol. Returns null when the symbol is absent from the file.
 */
function parseShortVolumeFile(text: string, symbol: string): ShortVolumeDay | null {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!line || line.startsWith('Date|') || line.startsWith('Total')) continue
    const parts = line.split('|')
    if (parts.length < 5) continue
    if ((parts[1] || '').toUpperCase() !== symbol) continue
    const dateRaw = parts[0]
    const date = dateRaw.length === 8 ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}` : dateRaw
    const shortVolume = num(parts[2])
    const shortExemptVolume = num(parts[3])
    const totalVolume = num(parts[4])
    return {
      date,
      shortVolume,
      shortExemptVolume,
      totalVolume,
      shortPct: totalVolume > 0 ? shortVolume / totalVolume : null,
    }
  }
  return null
}

/**
 * Fetch up to `days` of FINRA daily short-sale volume for `symbol`, walking
 * back from the most recent trading day. Each daily file is static once
 * published, so it caches well. Weekends / holidays / not-yet-published days
 * simply 404 and are skipped. Capped at a bounded number of HTTP calls.
 */
async function getShortVolume(symbol: string, days: number): Promise<{ rows: ShortVolumeDay[]; error: string | null }> {
  const out: ShortVolumeDay[] = []
  let error: string | null = null
  const maxLookback = Math.min(days + 14, 40) // bound the number of fetches
  const cursor = new Date()
  let attempts = 0
  while (out.length < days && attempts < maxLookback) {
    attempts++
    const day = cursor.getUTCDay()
    cursor.setUTCDate(cursor.getUTCDate() - 1) // advance cursor for next loop
    if (day === 0 || day === 6) continue // skip weekends
    const stamp = yyyymmdd(new Date(Date.UTC(
      cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1,
    )))
    try {
      const res = await fetch(`${FINRA_BASE}/CNMSshvol${stamp}.txt`, {
        headers: { 'User-Agent': UA },
        next: { revalidate: FINRA_REVALIDATE },
      })
      if (!res.ok) continue
      const text = await res.text()
      const row = parseShortVolumeFile(text, symbol)
      if (row) out.push(row)
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }
  if (out.length) recordKeyAccepted('finra')
  // Chronological order (oldest → newest) for charting.
  out.sort((a, b) => a.date.localeCompare(b.date))
  return { rows: out, error }
}

const SEC_FTD_BASE = 'https://www.sec.gov/files/data/fails-deliver-data'
const SEC_FTD_REVALIDATE = 86400

/**
 * Best-effort fetch of recent SEC fails-to-deliver rows for `symbol`. SEC
 * publishes semi-monthly ZIPs (cnsfails<YYYYMM>{a|b}.zip) that lag ~1 month,
 * so we try the last few candidate periods until one yields data. Absence is
 * NOT an error — FTD coverage is intentionally sparse.
 */
async function getFtd(symbol: string): Promise<FtdRecord[]> {
  const candidates: string[] = []
  const d = new Date()
  for (let i = 0; i < 4; i++) {
    const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    candidates.push(`cnsfails${ym}b.zip`, `cnsfails${ym}a.zip`)
    d.setUTCMonth(d.getUTCMonth() - 1)
  }

  for (const file of candidates) {
    try {
      const res = await fetch(`${SEC_FTD_BASE}/${file}`, {
        headers: { 'User-Agent': UA },
        next: { revalidate: SEC_FTD_REVALIDATE },
      })
      if (!res.ok) continue
      const buf = await res.arrayBuffer()
      const zip = await JSZip.loadAsync(buf)
      const entryName = Object.keys(zip.files).find(n => !zip.files[n].dir)
      if (!entryName) continue
      const text = await zip.files[entryName].async('string')
      const rows: FtdRecord[] = []
      for (const line of text.split(/\r?\n/)) {
        if (!line || line.startsWith('SETTLEMENT')) continue
        const parts = line.split('|')
        if (parts.length < 6) continue
        if ((parts[2] || '').toUpperCase() !== symbol) continue
        const dateRaw = parts[0]
        const date = dateRaw.length === 8 ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}` : dateRaw
        const priceN = Number(parts[5])
        rows.push({ date, quantity: num(parts[3]), price: Number.isFinite(priceN) ? priceN : null })
      }
      if (rows.length) {
        recordKeyAccepted('sec')
        rows.sort((a, b) => a.date.localeCompare(b.date))
        return rows.slice(-12)
      }
    } catch {
      // Try the next candidate period.
    }
  }
  return []
}

/**
 * Aggregate equity short-positioning signals (short volume + FTD) for a
 * symbol from public FINRA + SEC sources. Honest empty states: a symbol with
 * no recent short-volume rows returns an empty array, not a fabricated value.
 */
export async function getShortPositioning(symbolRaw: string, days = 10): Promise<ShortPositioningResult> {
  const fetchedAt = new Date().toISOString()
  const symbol = (symbolRaw || '').trim().toUpperCase()
  if (!symbol) {
    return {
      symbol, shortVolume: [], latest: null, avgShortPct: null, ftd: [], latestFtd: null,
      source: 'none', providerError: 'symbol required', fetchedAt,
    }
  }

  const [{ rows, error }, ftd] = await Promise.all([
    getShortVolume(symbol, Math.min(Math.max(days, 1), 30)),
    getFtd(symbol).catch(() => [] as FtdRecord[]),
  ])

  const pcts = rows.map(r => r.shortPct).filter((p): p is number => p != null)
  const avgShortPct = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null

  const parts: string[] = []
  if (rows.length) parts.push('FINRA short volume')
  if (ftd.length) parts.push('SEC fails-to-deliver')
  const source = parts.length ? parts.join(' + ') : 'none'

  return {
    symbol,
    shortVolume: rows,
    latest: rows.length ? rows[rows.length - 1] : null,
    avgShortPct,
    ftd,
    latestFtd: ftd.length ? ftd[ftd.length - 1] : null,
    source,
    providerError: rows.length ? null : error,
    fetchedAt,
  }
}

// ── SEC regulator lookup (CIK ⇆ symbol, name search) ──────────────────────────

const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json'
const SEC_TICKERS_REVALIDATE = 86400

export interface SecEntity {
  cik: string
  ticker: string
  name: string
  edgarBrowseUrl: string
  edgarFullTextUrl: string
}

export interface SecLookupResult {
  query: string
  entities: SecEntity[]
  count: number
  source: string
  providerError: string | null
  fetchedAt: string
}

function padCik(cik: number | string): string {
  return String(cik).replace(/\D/g, '').padStart(10, '0')
}

function toEntity(cikStr: number | string, ticker: string, title: string): SecEntity {
  const cik = padCik(cikStr)
  return {
    cik,
    ticker: (ticker || '').toUpperCase(),
    name: title || '',
    edgarBrowseUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=&dateb=&owner=include&count=40`,
    edgarFullTextUrl: `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(title || ticker)}`,
  }
}

/**
 * Resolve regulator identity for a query that may be a ticker, a CIK, or a
 * company-name fragment, using SEC's public company_tickers.json. Returns the
 * canonical CIK (zero-padded), ticker, name and EDGAR deep links.
 */
export async function secLookup(queryRaw: string, limit = 12): Promise<SecLookupResult> {
  const fetchedAt = new Date().toISOString()
  const query = (queryRaw || '').trim()
  if (!query) {
    return { query, entities: [], count: 0, source: 'none', providerError: 'query required', fetchedAt }
  }

  try {
    const res = await fetch(SEC_TICKERS_URL, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      next: { revalidate: SEC_TICKERS_REVALIDATE },
    })
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) recordKeyRejection('sec', `SEC tickers HTTP ${res.status}`)
      throw new Error(`SEC tickers HTTP ${res.status}`)
    }
    recordKeyAccepted('sec')
    const map = (await res.json()) as Record<string, { cik_str: number; ticker: string; title: string }>
    const all = Object.values(map)

    const q = query.toLowerCase()
    const isCik = /^\d{1,10}$/.test(query)
    const cikPadded = isCik ? padCik(query) : ''

    const exact: SecEntity[] = []
    const partial: SecEntity[] = []
    for (const row of all) {
      const tickerLc = (row.ticker || '').toLowerCase()
      const titleLc = (row.title || '').toLowerCase()
      if (isCik && padCik(row.cik_str) === cikPadded) {
        exact.push(toEntity(row.cik_str, row.ticker, row.title))
        continue
      }
      if (tickerLc === q) { exact.push(toEntity(row.cik_str, row.ticker, row.title)); continue }
      if (tickerLc.startsWith(q) || titleLc.includes(q)) {
        partial.push(toEntity(row.cik_str, row.ticker, row.title))
      }
    }
    const entities = [...exact, ...partial].slice(0, Math.min(Math.max(limit, 1), 50))

    return {
      query,
      entities,
      count: entities.length,
      source: entities.length ? 'SEC EDGAR' : 'none',
      providerError: null,
      fetchedAt,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { query, entities: [], count: 0, source: 'none', providerError: message, fetchedAt }
  }
}

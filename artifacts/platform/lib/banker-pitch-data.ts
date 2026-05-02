/**
 * Banker pitch deck assembler
 * ───────────────────────────
 * Builds a `BankerPitchInput` for the `bankerPitchTemplate` from real
 * platform data:
 *
 *   • Memo data assembler (overview, peers, qualitative, DCF) provides
 *     the snapshot bullets, KPI tiles, peer-comp table and appendix.
 *   • A server-side football-field assembler mirrors the logic in
 *     `components/valuations/useValuationBands.ts` so the deck's valuation
 *     slide shows the same 52-week range, peer-multiple IQR, transaction
 *     comp IQR and DCF sensitivity bands the analyst sees on the
 *     Valuations page.
 *   • Recent catalysts come from `/api/news` so the slide reflects the
 *     same headlines the platform's news surfaces show today, instead of
 *     the templated qualitative bullets used previously.
 *
 * The assembler optionally takes per-call overrides — `peers`, `wacc`,
 * `terminalGrowth`, `growthStage1/2` — so callers from a deal team
 * workspace can pin the deck to that workspace's curated peer set and
 * DCF assumptions.
 */
import { NextRequest } from 'next/server'
import { assembleInvestmentMemoData } from './investment-memo-data'
import { isUnavailable, type InvestmentMemoData } from './investment-memo-pptx'
import type { BankerPitchInput } from './deck-templates'
import type { DataSourceUsed, FootballFieldBand, PeersTableRow, TransactionsTableRow } from './deck-service'
import { POST as internalDcfPost } from '@/app/api/dcf/route'
import { INTERNAL_BYPASS_HEADER, internalBypassHeaderValue } from './internal-auth'

// ─── Helpers ────────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function quartile(values: number[], q: number): number | null {
  const xs = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (xs.length === 0) return null
  const idx = (xs.length - 1) * q
  const lo = Math.floor(idx); const hi = Math.ceil(idx)
  if (lo === hi) return xs[lo]
  return xs[lo] + (xs[hi] - xs[lo]) * (idx - lo)
}
function median(values: number[]): number | null { return quartile(values, 0.5) }

async function safeJson<T = any>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: 'no-store', ...init })
    if (!r.ok) return null
    return await r.json() as T
  } catch { return null }
}

// ─── Server-side equivalent of useValuationBands ────────────────────────────
//
// The Valuations page builds bands client-side from /api/quote, key-metrics
// + ratios (for multiples) and POST /api/dcf with sensitivity:true. We
// replicate that here so the deck's football field matches what the analyst
// sees on the Valuations page — including the same per-share scale.

interface PeerRowMeta {
  /** Chart row label */
  label: string
  /** Field name on the augmented quote payload exposing the multiple */
  multipleField: string
  /**
   * Subject-side scaler that converts a peer multiple into a per-share
   * implied price. Returns null when the metric isn't recoverable.
   */
  metric: (subject: any) => number | null
}

const PEER_ROWS: PeerRowMeta[] = [
  // implied price ≈ subject price × (peer EV/EBITDA ÷ subject EV/EBITDA)
  { label: 'TEV/EBITDA',     multipleField: 'evEbitda', metric: (s) => { const px = num(s?.price); const ev = num(s?.evEbitda); return (px == null || !ev) ? null : px / ev } },
  // P/S proxy when TEV/Revenue isn't exposed
  { label: 'TEV/Revenue',    multipleField: 'ps',       metric: (s) => { const px = num(s?.price); const ps = num(s?.ps); return (px == null || !ps) ? null : px / ps } },
  // implied price = peer P/E × subject EPS
  { label: 'Price/Earnings', multipleField: 'pe',       metric: (s) => num(s?.eps) },
]

const DEFAULT_PEERS: Record<string, string[]> = {
  AAPL:  ['MSFT', 'GOOGL', 'META'],
  MSFT:  ['AAPL', 'GOOGL', 'AMZN'],
  GOOGL: ['MSFT', 'META',  'AMZN'],
  NVDA:  ['AMD',  'AVGO',  'INTC'],
  META:  ['GOOGL','SNAP',  'PINS'],
  AMZN:  ['MSFT', 'GOOGL', 'WMT'],
  TSLA:  ['F',    'GM',    'RIVN'],
}
function defaultPeersFor(symbol: string): string[] {
  return DEFAULT_PEERS[symbol] || ['SPY', 'QQQ', 'DIA']
}

// ── Tiny formatters used when we synthesise a peer-comps table directly
//    from augmented quotes (not via the memo path). Mirrors the formatting
//    `lib/investment-memo-data.ts` uses so deck rows look uniform regardless
//    of which source supplied them.
function fmtMoneyShort(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n === 0) return 'n/a'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(1)}T`
  if (abs >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e3)  return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}
function fmtMul(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n === 0) return 'n/a'
  return `${n.toFixed(1)}x`
}
function fmtPctRaw(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return 'n/a'
  return `${(n * 100).toFixed(1)}%`
}

async function loadAugmentedQuote(baseUrl: string, sym: string): Promise<any | null> {
  const [baseQuote, km, ra] = await Promise.all([
    safeJson<any>(`${baseUrl}/api/quote?symbol=${encodeURIComponent(sym)}`),
    safeJson<any>(`${baseUrl}/api/financials/statements?symbol=${encodeURIComponent(sym)}&statement=key-metrics&period=annual&limit=1`)
      .then(j => j?.rows?.[0] || null),
    safeJson<any>(`${baseUrl}/api/financials/statements?symbol=${encodeURIComponent(sym)}&statement=ratios&period=annual&limit=1`)
      .then(j => j?.rows?.[0] || null),
  ])
  const quoteUsable = baseQuote && !baseQuote.error && (baseQuote.price != null || baseQuote.symbol)
  if (!quoteUsable && !km && !ra) return null
  const merged: any = { ...(quoteUsable ? baseQuote : {}) }
  if (merged.pe == null && ra?.priceToEarningsRatio != null) merged.pe = ra.priceToEarningsRatio
  if (merged.ps == null && ra?.priceToSalesRatio != null) merged.ps = ra.priceToSalesRatio
  if (merged.evEbitda == null && km?.evToEBITDA != null)   merged.evEbitda = km.evToEBITDA
  if (merged.eps == null && merged.price != null && merged.pe) merged.eps = merged.price / merged.pe
  return merged
}

export interface ValuationBandsAssembly {
  bands: FootballFieldBand[]
  currentPrice?: number
  weightedMid?: number
  effectivePeers: string[]
  /** True when the DCF sensitivity grid produced usable values. */
  dcfUsable: boolean
  /** True when at least one transaction-comp band was emitted. */
  txCompsUsable: boolean
  /**
   * Augmented quote payloads for each effective peer ticker (price + the
   * multiples needed to render a peer-comps table). Indices align with
   * `effectivePeers`. Slot is `null` if the upstream lookup failed.
   */
  peerQuotes: (any | null)[]
}

export interface DcfFetchInput {
  symbol: string
  discountRate: number
  terminalGrowth: number
  growthStage1: number
  growthStage2: number
}

/**
 * Pluggable DCF retrieval. The default implementation calls the internal
 * `POST /api/dcf` handler directly in-process with the per-process
 * bypass token (see `defaultDcfFetcher` below). Tests inject a stub.
 *
 * Returning `null` (or throwing) is treated as "DCF unavailable" — the
 * football field will fall back to the price-only DCF band logic.
 */
export type DcfFetcher = (input: DcfFetchInput) => Promise<any | null>

export interface ValuationBandsOpts {
  peers?: string[]
  wacc?: number
  terminalGrowth?: number
  growthStage1?: number
  growthStage2?: number
  /** Optional DCF fetcher override — defaults to the in-process handler. */
  dcfFetcher?: DcfFetcher
}

/**
 * Default in-process DCF caller. POST /api/dcf is auth-gated because it
 * consumes paid financials quota; an outbound `fetch` from server-side
 * code would lose the user's session cookie and 401, dropping the DCF
 * band from generated decks. Composing a NextRequest against the
 * imported handler with the per-process bypass token avoids both the
 * network hop and the auth-loss risk — the token never leaves this
 * Node.js process (mirrors the pattern used by `/api/v1/dcf`).
 */
export const defaultDcfFetcher: DcfFetcher = async (input) => {
  try {
    const req = new NextRequest('http://internal/api/dcf', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [INTERNAL_BYPASS_HEADER]: internalBypassHeaderValue(),
      },
      body: JSON.stringify({ ...input, sensitivity: true }),
    })
    const res = await internalDcfPost(req)
    if (!res.ok) return null
    const txt = await res.text()
    return txt ? JSON.parse(txt) : null
  } catch {
    return null
  }
}

/**
 * Assemble the football-field bands server-side using the same data
 * sources the Valuations page uses. Bands are emitted in **per-share**
 * terms so the chart can show prices on a single scale.
 */
export async function assembleValuationBands(
  baseUrl: string,
  symbol: string,
  memo: InvestmentMemoData,
  opts: ValuationBandsOpts = {},
): Promise<ValuationBandsAssembly> {
  const sym = symbol.toUpperCase().trim()
  const effectivePeers = (opts.peers && opts.peers.length > 0
    ? opts.peers
    : defaultPeersFor(sym))
    .map(p => (p || '').trim().toUpperCase())
    .filter(p => p && p !== sym)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 8)

  const wacc = opts.wacc ?? 0.09
  const terminalGrowth = opts.terminalGrowth ?? 0.025
  const growthStage1 = opts.growthStage1 ?? 0.08
  const growthStage2 = opts.growthStage2 ?? 0.04

  // Fan out: subject quote, peer quotes, DCF sensitivity.
  const [subject, ...peerQuotesArr] = await Promise.all([
    loadAugmentedQuote(baseUrl, sym),
    ...effectivePeers.map(p => loadAugmentedQuote(baseUrl, p)),
  ])
  // DCF via the pluggable fetcher (see `defaultDcfFetcher`). Production
  // routes through the in-process handler with the bypass token so we
  // don't lose auth on a self-fetch; tests inject a stub.
  const dcfFetch = opts.dcfFetcher ?? defaultDcfFetcher
  const dcf = await dcfFetch({
    symbol: sym,
    discountRate: wacc,
    terminalGrowth,
    growthStage1,
    growthStage2,
  })

  const bands: FootballFieldBand[] = []

  // 1) 52-week stock price band
  const lo52 = num(subject?.yearLow ?? subject?.low52w)
  const hi52 = num(subject?.yearHigh ?? subject?.high52w)
  if (lo52 != null && hi52 != null && hi52 > lo52) {
    bands.push({ method: '52-week stock price', low: lo52, mid: (lo52 + hi52) / 2, high: hi52 })
  }

  // 2) Peer comp bands (IQR per multiple → per-share implied price)
  const peerArr = peerQuotesArr.filter(Boolean)
  for (const meta of PEER_ROWS) {
    const subjectMetric = meta.metric(subject)
    const peerMultiples = peerArr
      .map(q => num(q?.[meta.multipleField]))
      .filter((v): v is number => v != null && v > 0)
    if (subjectMetric == null || peerMultiples.length < 2) continue
    const q1 = quartile(peerMultiples, 0.25)
    const q3 = quartile(peerMultiples, 0.75)
    const m  = median(peerMultiples)
    if (q1 == null || q3 == null) continue
    let low = q1 * subjectMetric
    let high = q3 * subjectMetric
    if (low > high) [low, high] = [high, low]
    const mid = m != null ? m * subjectMetric : (low + high) / 2
    bands.push({ method: `Peer comps · ${meta.label}`, low, mid, high })
  }

  // 3) Transaction comps band — IQR of recent precedent EV/EBITDA &
  //    EV/Revenue applied to the subject's LTM EBITDA / revenue. We
  //    derive subject totals from /api/quote (marketCap as proxy TEV) —
  //    this gives a per-share implied price using sharesOut.
  let txCompsUsable = false
  if (!isUnavailable(memo.transactions) && memo.transactions.length >= 2) {
    const sharesOut = num(subject?.sharesOut)
    // Parse the formatted multiples back to numbers (e.g. "12.4x")
    const parseMul = (s: string): number | null => {
      const m = /^([\d.]+)x?$/i.exec(String(s).trim())
      return m ? num(m[1]) : null
    }
    // Recover subject LTM revenue / EBITDA from the overview metrics
    // (these are formatted strings like "$3.4B"; we rebuild the raw
    // numbers from the same ltm helpers exposed by the memo via the
    // `metrics` array — fall back to quote's revenue if absent).
    const fmtToNum = (s: string): number | null => {
      const m = /^\$?([\d,]+\.?\d*)([KMBT])?/i.exec(String(s).trim())
      if (!m) return null
      const n = parseFloat(m[1].replace(/,/g, ''))
      if (!isFinite(n)) return null
      const u = (m[2] || '').toUpperCase()
      return u === 'T' ? n * 1e12 : u === 'B' ? n * 1e9 : u === 'M' ? n * 1e6 : u === 'K' ? n * 1e3 : n
    }
    let ltmRev: number | null = null
    let ltmEbitda: number | null = null
    if (!isUnavailable(memo.overview)) {
      for (const m of memo.overview.metrics) {
        if (/LTM Revenue$/i.test(m.label))   ltmRev = fmtToNum(m.value)
        if (/LTM EBITDA$/i.test(m.label))    ltmEbitda = fmtToNum(m.value)
      }
    }
    if (ltmRev == null) ltmRev = num(subject?.revenue)

    const evRev   = memo.transactions.map(t => parseMul(t.evRevenue)).filter((v): v is number => v != null && v > 0)
    const evEbm   = memo.transactions.map(t => parseMul(t.evEbitda)).filter((v): v is number => v != null && v > 0)
    const totalDebt = num(subject?.totalDebt) ?? 0
    const cash      = num(subject?.cash) ?? 0
    const netDebt   = totalDebt - cash

    if (sharesOut && sharesOut > 0) {
      if (evRev.length >= 2 && ltmRev) {
        const q1 = quartile(evRev, 0.25)!; const q3 = quartile(evRev, 0.75)!
        const lowEv = q1 * ltmRev; const highEv = q3 * ltmRev
        const lowPx  = Math.max(0, (lowEv  - netDebt) / sharesOut)
        const highPx = Math.max(0, (highEv - netDebt) / sharesOut)
        const m = median(evRev)
        const midPx = m != null ? Math.max(0, (m * ltmRev - netDebt) / sharesOut) : (lowPx + highPx) / 2
        bands.push({ method: 'Precedent M&A · EV/Revenue', low: Math.min(lowPx, highPx), mid: midPx, high: Math.max(lowPx, highPx) })
        txCompsUsable = true
      }
      if (evEbm.length >= 2 && ltmEbitda) {
        const q1 = quartile(evEbm, 0.25)!; const q3 = quartile(evEbm, 0.75)!
        const lowEv = q1 * ltmEbitda; const highEv = q3 * ltmEbitda
        const lowPx  = Math.max(0, (lowEv  - netDebt) / sharesOut)
        const highPx = Math.max(0, (highEv - netDebt) / sharesOut)
        const m = median(evEbm)
        const midPx = m != null ? Math.max(0, (m * ltmEbitda - netDebt) / sharesOut) : (lowPx + highPx) / 2
        bands.push({ method: 'Precedent M&A · EV/EBITDA', low: Math.min(lowPx, highPx), mid: midPx, high: Math.max(lowPx, highPx) })
        txCompsUsable = true
      }
    }
  }

  // 4) DCF sensitivity range — flatten the (WACC × terminal growth) grid
  //    into per-share min/max so the band reflects the same uncertainty
  //    the Valuations page surfaces.
  let dcfUsable = false
  const sens = dcf?.sensitivity
  let dcfLow: number | null = null, dcfHigh: number | null = null, dcfMed: number | null = null
  if (sens && Array.isArray(sens.values)) {
    const flat: number[] = []
    for (const row of sens.values as number[][]) for (const v of row) if (Number.isFinite(v)) flat.push(v)
    if (flat.length) {
      dcfLow = Math.min(...flat)
      dcfHigh = Math.max(...flat)
      dcfMed = num(dcf?.intrinsicValuePerShare) ?? (dcfLow + dcfHigh) / 2
    }
  }
  if (dcfMed == null) dcfMed = num(dcf?.intrinsicValuePerShare)
  if (dcfMed != null && dcfLow == null && dcfHigh == null) {
    // ±15 % default band when only the base case is returned.
    dcfLow = dcfMed * 0.85
    dcfHigh = dcfMed * 1.15
  }
  if (dcfLow != null && dcfHigh != null && dcfMed != null) {
    const waccPct = (wacc * 100).toFixed(2)
    const tgPct   = (terminalGrowth * 100).toFixed(2)
    bands.push({
      method: `DCF (${waccPct}% WACC · ${tgPct}% terminal)`,
      low: dcfLow, mid: dcfMed, high: dcfHigh,
    })
    dcfUsable = true
  }

  const currentPrice = num(subject?.price) ?? undefined
  const mids = bands.map(b => b.mid ?? (b.low + b.high) / 2).filter(v => Number.isFinite(v))
  const weightedMid = mids.length ? mids.reduce((a, b) => a + b, 0) / mids.length : undefined

  return {
    bands,
    currentPrice,
    weightedMid,
    effectivePeers,
    dcfUsable,
    txCompsUsable,
    peerQuotes: peerQuotesArr,
  }
}

// ─── Recent catalysts via /api/news ─────────────────────────────────────────

interface NewsArticle {
  title?: string
  summary?: string
  url?: string
  source?: string
  publishedAt?: string
  sentiment?: string | null
}

/**
 * Pull recent news headlines and shape them as catalyst bullets. Falls
 * back to the templated qualitative catalysts on memo when no news is
 * returned (common for non-US tickers / fresh listings).
 *
 * Each provenance is exposed as its own array so callers can render
 * "Recent news" and "Strategic themes" as separate, clearly-labelled
 * groups on the deck — analysts shouldn't have to guess whether a
 * bullet came from a real headline or a generic templated fallback.
 *
 * Semantics:
 *
 *   • `news`    — formatted lines from /api/news; empty when the feed
 *                 returned nothing (e.g. non-US tickers, fresh listings)
 *   • `themes`  — templated lines from `memo.qualitative.catalysts`;
 *                 only populated as a fallback when `news` is empty so
 *                 we don't pad real headlines with generic bullets
 *   • `source`  — 'news' when `news` has lines, 'memo' when only
 *                 `themes` has lines, 'none' when neither does
 *
 * Data-source attribution is keyed off `source` so the deck's "Data
 * Sources Used" slide cleanly attributes each rendered group to its
 * actual upstream feed.
 */
export interface RecentCatalystsResult {
  news: string[]
  themes: string[]
  source: 'news' | 'memo' | 'none'
}
export async function assembleRecentCatalysts(
  baseUrl: string,
  symbol: string,
  memo: InvestmentMemoData,
  limit = 6,
): Promise<RecentCatalystsResult> {
  const sym = symbol.toUpperCase().trim()
  const data = await safeJson<{ articles?: NewsArticle[] }>(`${baseUrl}/api/news?symbol=${encodeURIComponent(sym)}&limit=${limit * 2}`)
  const articles = Array.isArray(data?.articles) ? data!.articles! : []
  // Keep entries with a real headline & a publish date; trim & format.
  const news: string[] = []
  const seen = new Set<string>()
  for (const a of articles) {
    const t = (a.title || '').trim()
    if (!t) continue
    const key = t.toLowerCase().slice(0, 80)
    if (seen.has(key)) continue
    seen.add(key)
    const date = (a.publishedAt || '').slice(0, 10)
    const src  = (a.source || '').trim()
    const tag  = a.sentiment ? ` (${a.sentiment})` : ''
    const head = date ? `${date} — ${t}` : t
    const tail = src ? ` · ${src}${tag}` : tag
    news.push(`${head}${tail}`)
    if (news.length >= limit) break
  }
  if (news.length > 0) return { news, themes: [], source: 'news' }
  // Templated fallback so the slide still renders something useful.
  if (!isUnavailable(memo.qualitative) && memo.qualitative.catalysts.length > 0) {
    return { news: [], themes: memo.qualitative.catalysts.slice(0, limit), source: 'memo' }
  }
  return { news: [], themes: [], source: 'none' }
}

// ─── Pitch assembler ────────────────────────────────────────────────────────

export interface BankerPitchAssembly {
  pitch: BankerPitchInput
  /** The underlying memo data (kept for callers that want to attach the same
   *  data to other surfaces, e.g. show a price target on the company page). */
  memo: InvestmentMemoData
}

export interface BankerPitchOpts extends ValuationBandsOpts {}

/**
 * Pure transform from an assembled memo + (already-fetched) valuation bands
 * + recent-catalysts result into the `BankerPitchInput` the
 * `bankerPitchTemplate` consumes. Split out from `assembleBankerPitch` so
 * the degraded-input behaviour (peers, transactions, DCF, consensus each
 * individually unavailable) can be regression-tested without going through
 * the HTTP-backed assemblers.
 *
 * Contract — degradation rules locked in
 * `__tests__/deck-service.test.ts`:
 *   • peers section unavailable AND no opts.peers override → `pitch.peers`
 *     is undefined (template skips the slide) AND no peer-set entry
 *     appears in `dataSources`
 *   • memo.transactions unavailable → `pitch.transactions` is undefined
 *     AND no "FMP M&A latest feed" entry appears in `dataSources`
 *   • vb.dcfUsable === false → no "Finsyt DCF model" entry appears in
 *     `dataSources` (DCF band only fires when the model returned values)
 *   • valuation forwardConsensus missing → no "FMP analyst estimates feed"
 *     entry appears in `dataSources`
 *   • catalystsResult.news.length === 0 → no "Finsyt news aggregator"
 *     entry appears in `dataSources` (real headlines drive that disclosure)
 *   • catalystsResult.themes.length === 0 → no "Templated catalyst themes"
 *     entry appears in `dataSources` (templated fallback drives that one)
 *   • `dataSources` only ever lists feeds/models that actually contributed,
 *     never the optimistic "everything we might have called" list
 */
export function pitchFromAssembly(args: {
  memo:             InvestmentMemoData
  vb:               ValuationBandsAssembly
  catalystsResult:  RecentCatalystsResult
  opts?:            BankerPitchOpts
}): BankerPitchInput {
  const { memo, vb, catalystsResult } = args
  const opts = args.opts ?? {}

  // ── Snapshot bullets — pull the most decision-useful facts from memo ──
  const snapshotBullets: string[] = []
  if (!isUnavailable(memo.overview) && memo.overview.description) {
    const desc = memo.overview.description.length > 280
      ? memo.overview.description.slice(0, 277) + '…'
      : memo.overview.description
    snapshotBullets.push(desc)
  }
  if (!isUnavailable(memo.overview) && memo.overview.segments.length > 0) {
    snapshotBullets.push(`Operating mix: ${memo.overview.segments.slice(0, 3).join(' · ')}`)
  }
  if (!isUnavailable(memo.qualitative)) {
    if (memo.qualitative.strengths[0]) snapshotBullets.push(`Strength — ${memo.qualitative.strengths[0]}`)
    if (memo.qualitative.risks[0])     snapshotBullets.push(`Risk — ${memo.qualitative.risks[0]}`)
  }

  // ── Snapshot KPI tiles ──
  const snapshotMetrics: { label: string; value: string }[] = []
  if (!isUnavailable(memo.overview)) {
    for (const m of memo.overview.metrics.slice(0, 6)) snapshotMetrics.push(m)
  }

  // Build the structured catalysts payload the template renders as
  // separate "Recent news" + "Strategic themes" slides. We only emit
  // the field when at least one group has bullets so the template can
  // skip both slides cleanly when neither is available.
  const catalysts = (catalystsResult.news.length > 0 || catalystsResult.themes.length > 0)
    ? {
        ...(catalystsResult.news.length   > 0 ? { news:   catalystsResult.news }   : {}),
        ...(catalystsResult.themes.length > 0 ? { themes: catalystsResult.themes } : {}),
      }
    : undefined

  // ── Peers table ──
  //
  //   The deck's peer table membership must match what the analyst pinned
  //   in their workspace. When `opts.peers` is provided we build the
  //   table directly from the augmented peer quotes already fetched by
  //   `assembleValuationBands` — this guarantees the override list is
  //   honoured deterministically, even if the FMP stock-peers feed (the
  //   default memo path) returned a different set.
  //
  //   Without an override we fall back to `memo.peers` (richer fields:
  //   revenue growth, EBITDA margin) so the default deck preserves the
  //   memo's wider data shape.
  let peers: PeersTableRow[] | undefined
  if (opts.peers && opts.peers.length > 0) {
    const memoIndex = new Map<string, any>()
    if (!isUnavailable(memo.peers)) {
      for (const r of memo.peers) memoIndex.set(r.ticker.toUpperCase(), r)
    }
    const rows: PeersTableRow[] = []
    for (let i = 0; i < vb.effectivePeers.length; i++) {
      const sym = vb.effectivePeers[i]
      const memoRow = memoIndex.get(sym)
      const q = vb.peerQuotes[i] || {}
      // Prefer memo formatted fields when present (they're richer); fall
      // through to formatting the augmented quote so an overridden ticker
      // missing from the memo path still shows up with the multiples we
      // have on hand from /api/quote + /api/financials/statements.
      rows.push({
        ticker:        memoRow?.ticker        || sym,
        name:          memoRow?.name          || (q.name || q.companyName || sym).slice(0, 40),
        marketCap:     memoRow?.marketCap     || fmtMoneyShort(num(q.marketCap)),
        revenueGrowth: memoRow?.revenueGrowth || fmtPctRaw(num(q.revenueGrowth)),
        ebitdaMargin:  memoRow?.ebitdaMargin  || fmtPctRaw(num(q.ebitdaMargin)),
        evRevenue:     memoRow?.evRevenue     || fmtMul(num(q.ps)),     // P/S proxy
        evEbitda:      memoRow?.evEbitda      || fmtMul(num(q.evEbitda)),
        pe:            memoRow?.pe            || fmtMul(num(q.pe)),
      })
    }
    peers = rows.slice(0, 8)
  } else if (!isUnavailable(memo.peers) && memo.peers.length > 0) {
    peers = memo.peers.slice(0, 8).map(p => ({
      ticker: p.ticker, name: p.name, marketCap: p.marketCap,
      revenueGrowth: p.revenueGrowth, ebitdaMargin: p.ebitdaMargin,
      evRevenue: p.evRevenue, evEbitda: p.evEbitda, pe: p.pe,
    }))
  }

  // ── Transactions table — dedicated section, skipped when no precedents.
  //
  //   Pulled from the same memo `transactions` array that already feeds
  //   the football-field "Precedent M&A" bands above, so the table and
  //   the band(s) are sourced consistently. We strip the "$" prefix from
  //   evMm if needed because the renderer's column header already says
  //   "EV ($mm)", though we tolerate both shapes.
  let transactions: TransactionsTableRow[] | undefined
  if (!isUnavailable(memo.transactions) && memo.transactions.length > 0) {
    transactions = memo.transactions.slice(0, 9).map(t => ({
      date:      t.date,
      acquirer:  t.acquirer,
      target:    t.target,
      evMm:      t.evMm,
      evRevenue: t.evRevenue,
      evEbitda:  t.evEbitda,
    }))
  }

  // ── Appendix ──
  const appendix: { title: string; bullets: string[] }[] = []
  if (!isUnavailable(memo.qualitative)) {
    if (memo.qualitative.strengths.length > 1) appendix.push({ title: 'Strengths',   bullets: memo.qualitative.strengths })
    if (memo.qualitative.risks.length     > 1) appendix.push({ title: 'Risks',        bullets: memo.qualitative.risks })
    if (memo.qualitative.esg.length       > 0) appendix.push({ title: 'ESG factors',  bullets: memo.qualitative.esg })
  }

  // ── Data sources ──
  const dataSources: DataSourceUsed[] = [
    { name: 'Financial Modeling Prep', category: 'provider', detail: 'Quote, fundamentals, segments, ratios' },
  ]
  if (vb.effectivePeers.length > 0) {
    dataSources.push({
      name: opts.peers && opts.peers.length > 0 ? 'Workspace peer set' : 'Default peer set',
      category: 'feed',
      detail: vb.effectivePeers.join(', '),
    })
  }
  if (!isUnavailable(memo.transactions) && memo.transactions.length > 0) {
    dataSources.push({
      name: 'FMP M&A latest feed',
      category: 'feed',
      detail: vb.txCompsUsable
        ? `${memo.transactions.length} precedent transactions · feeds tx-comps band(s) and table`
        : `${memo.transactions.length} precedent transactions · table only (insufficient multiples for IQR band)`,
    })
  }
  if (vb.dcfUsable) dataSources.push({
    name: 'Finsyt DCF model',
    category: 'model',
    detail: `2-stage DCF · ${(opts.wacc ?? 0.09) * 100}% WACC · ${(opts.terminalGrowth ?? 0.025) * 100}% terminal growth`,
  })
  if (!isUnavailable(memo.valuation) && memo.valuation.forwardConsensus) {
    dataSources.push({ name: 'FMP analyst estimates feed', category: 'feed', detail: 'Forward NTM revenue / EPS / price targets' })
  }
  // Source attribution: each rendered catalyst group gets its own
  // disclosure so the deck doesn't overstate (or understate) which
  // upstream feed actually produced the bullets the analyst is
  // looking at.
  //
  //   • news   → "Finsyt news aggregator" (real /api/news headlines)
  //   • themes → "Templated catalyst themes" (memo-qualitative fallback,
  //              clearly tagged so analysts know it's not real news)
  if (catalystsResult.news.length > 0) {
    dataSources.push({
      name: 'Finsyt news aggregator',
      category: 'feed',
      detail: `Recent headlines via /api/news · ${catalystsResult.news.length} bullets on the "Recent news" slide`,
    })
  }
  if (catalystsResult.themes.length > 0) {
    dataSources.push({
      name: 'Templated catalyst themes',
      category: 'model',
      detail: `Generic next-12-months themes from the investment-memo qualitative builder · ${catalystsResult.themes.length} bullets on the "Strategic themes" slide${catalystsResult.source === 'memo' ? ' (used because /api/news returned no headlines)' : ''}`,
    })
  }

  const pitch: BankerPitchInput = {
    ticker:      memo.identity.ticker,
    companyName: memo.identity.name,
    exchange:    memo.identity.exchange,
    sector:      memo.identity.sector,
    asOf:        memo.asOf,
    footerLine:  memo.sourceLine,
    snapshotMetrics,
    snapshotBullets,
    footballField: vb.bands.length > 0
      ? { bands: vb.bands, currentPrice: vb.currentPrice, weightedMid: vb.weightedMid, currency: '$' }
      : undefined,
    peers,
    transactions,
    catalysts,
    appendix,
    dataSources,
  }
  return pitch
}

export async function assembleBankerPitch(
  baseUrl: string,
  ticker: string,
  opts: BankerPitchOpts = {},
): Promise<BankerPitchAssembly> {
  const memo = await assembleInvestmentMemoData(baseUrl, ticker)
  const [vb, catalystsResult] = await Promise.all([
    assembleValuationBands(baseUrl, ticker, memo, opts),
    assembleRecentCatalysts(baseUrl, ticker, memo),
  ])
  return { pitch: pitchFromAssembly({ memo, vb, catalystsResult, opts }), memo }
}

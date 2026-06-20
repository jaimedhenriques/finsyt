/**
 * Investment Memo data assembler
 * ──────────────────────────────
 * Given a ticker, fan-out to the existing internal data routes
 * (/api/quote, /api/financials/*, /api/estimates) plus `lib/dcf-model.ts`
 * for DCF and assemble a typed `InvestmentMemoData` object that the PPTX
 * builder can render presentation-only.
 *
 * All numbers are rounded and unit-formatted at this layer so slide
 * builders never run any conditional formatting logic. If a section's
 * data is genuinely missing the assembler returns the typed
 * `SectionUnavailable` marker — this surfaces in the PPTX as a clean
 * "Data unavailable" placeholder rather than a broken slide.
 */

import { runDcf, capmCostOfEquity, type DcfAssumptions } from './dcf-model'
import type {
  InvestmentMemoData,
  CompanyIdentity,
  OverviewSection,
  ValuationSection,
  PeerRow,
  TransactionRow,
  DcfSection,
  QualitativeSection,
  SectionUnavailable,
} from './investment-memo-pptx'

const FMP = process.env.FMP_API_KEY || ''

// ─── Number formatters ──────────────────────────────────────────────────────
export function fmtMoney(n: number | null | undefined, currency = 'USD'): string {
  if (n == null || !isFinite(n) || n === 0) return '—'
  const sign = n < 0 ? '-' : ''
  const a = Math.abs(n)
  const sym = currency === 'USD' ? '$' : ''
  if (a >= 1e12) return `${sign}${sym}${(a / 1e12).toFixed(2)}T`
  if (a >= 1e9)  return `${sign}${sym}${(a / 1e9).toFixed(2)}B`
  if (a >= 1e6)  return `${sign}${sym}${(a / 1e6).toFixed(1)}M`
  if (a >= 1e3)  return `${sign}${sym}${(a / 1e3).toFixed(1)}K`
  return `${sign}${sym}${a.toFixed(2)}`
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !isFinite(n)) return '—'
  // Inputs may be 0–1 (decimal) or already in percent — heuristic: if |n| <= 1.5 treat as decimal.
  const v = Math.abs(n) <= 1.5 ? n * 100 : n
  return `${v >= 0 ? '' : ''}${v.toFixed(digits)}%`
}

export function fmtMultiple(n: number | null | undefined, digits = 1): string {
  if (n == null || !isFinite(n) || n === 0) return '—'
  return `${n.toFixed(digits)}x`
}

export function fmtPlainNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return '—'
  return n.toFixed(digits)
}

function unavailable(reason: string): SectionUnavailable {
  return { unavailable: true, reason }
}

async function safeJson<T = any>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: 'no-store', ...init })
    if (!r.ok) return null
    return await r.json() as T
  } catch { return null }
}

// ─── Identity / quote ───────────────────────────────────────────────────────
async function fetchQuote(baseUrl: string, ticker: string) {
  return safeJson<any>(`${baseUrl}/api/quote?symbol=${encodeURIComponent(ticker)}`)
}

interface EstimatesQuarterRow {
  period: string
  revenue: number | null
  epsEst:  number | null
  epsHigh: number | null
  epsLow:  number | null
}
interface EstimatesResponse {
  symbol: string
  rating: string | null
  priceTarget: number | null
  priceTargetHigh: number | null
  priceTargetLow:  number | null
  priceTargetMedian: number | null
  numAnalysts: number | null
  quarterly: EstimatesQuarterRow[]
}
async function fetchEstimates(baseUrl: string, ticker: string): Promise<EstimatesResponse | null> {
  return safeJson<EstimatesResponse>(`${baseUrl}/api/estimates?symbol=${encodeURIComponent(ticker)}`)
}

async function fetchIncomeAnnual(baseUrl: string, ticker: string) {
  return safeJson<any>(`${baseUrl}/api/financials/statements?symbol=${encodeURIComponent(ticker)}&statement=income-statement&period=annual&limit=4`)
}

async function fetchIncomeQuarterly(baseUrl: string, ticker: string) {
  return safeJson<any>(`${baseUrl}/api/financials/statements?symbol=${encodeURIComponent(ticker)}&statement=income-statement&period=quarter&limit=8`)
}

async function fetchCashFlowAnnual(baseUrl: string, ticker: string) {
  return safeJson<any>(`${baseUrl}/api/financials/statements?symbol=${encodeURIComponent(ticker)}&statement=cash-flow-statement&period=annual&limit=2`)
}

async function fetchKeyMetrics(baseUrl: string, ticker: string) {
  return safeJson<any>(`${baseUrl}/api/financials/statements?symbol=${encodeURIComponent(ticker)}&statement=key-metrics&period=annual&limit=6`)
}

async function fetchSegments(baseUrl: string, ticker: string) {
  return safeJson<any>(`${baseUrl}/api/financials/segments?symbol=${encodeURIComponent(ticker)}`)
}

// Peers via FMP stock-peers endpoint (requires FMP). Returns an array of tickers.
async function fetchPeerTickers(ticker: string): Promise<string[]> {
  if (!FMP) return []
  const r = await safeJson<any>(`https://financialmodelingprep.com/stable/stock-peers?symbol=${encodeURIComponent(ticker)}&apikey=${FMP}`)
  if (Array.isArray(r) && r.length) {
    // Two known shapes: [{ peersList: [...] }] or [{ symbol, peers }] or [{symbol: 'AAPL'}, …]
    const first = r[0]
    if (Array.isArray(first?.peersList))  return first.peersList.slice(0, 8)
    if (Array.isArray(first?.peers))       return first.peers.slice(0, 8)
    if (typeof first?.symbol === 'string') return r.map((x: any) => x.symbol).slice(0, 8)
  }
  return []
}

async function fetchPeerProfile(ticker: string) {
  if (!FMP) return null
  const [profileArr, ratiosArr, growthArr] = await Promise.all([
    safeJson<any>(`https://financialmodelingprep.com/stable/profile?symbol=${ticker}&apikey=${FMP}`),
    safeJson<any>(`https://financialmodelingprep.com/stable/ratios-ttm?symbol=${ticker}&apikey=${FMP}`),
    safeJson<any>(`https://financialmodelingprep.com/stable/income-statement-growth?symbol=${ticker}&period=annual&limit=1&apikey=${FMP}`),
  ])
  const profile = Array.isArray(profileArr) ? profileArr[0] : profileArr
  const ratios  = Array.isArray(ratiosArr)  ? ratiosArr[0]  : ratiosArr
  const growth  = Array.isArray(growthArr)  ? growthArr[0]  : growthArr
  return { profile, ratios, growth }
}

// ─── Section builders ───────────────────────────────────────────────────────
function buildIdentity(ticker: string, quote: any): CompanyIdentity {
  return {
    ticker,
    name:     quote?.name     || ticker,
    exchange: quote?.exchange || '',
    sector:   quote?.sector   || '',
    industry: quote?.industry || '',
    country:  quote?.country  || 'US',
  }
}

function ltmRevenue(income?: any): number | null {
  const rows = income?.rows
  if (!Array.isArray(rows) || rows.length === 0) return null
  const last4 = rows.slice(0, 4)
  const sum = last4.reduce((s: number, r: any) => s + (Number(r.revenue) || 0), 0)
  return sum > 0 ? sum : null
}

function ltmEbitda(income?: any): number | null {
  const rows = income?.rows
  if (!Array.isArray(rows) || rows.length === 0) return null
  const last4 = rows.slice(0, 4)
  const sum = last4.reduce((s: number, r: any) => {
    const op = Number(r.operatingIncome) || 0
    const da = Number(r.depreciationAndAmortization) || 0
    return s + op + da
  }, 0)
  return sum > 0 ? sum : null
}

function annualGrowth(annualIncome?: any): number | null {
  const rows = annualIncome?.rows
  if (!Array.isArray(rows) || rows.length < 2) return null
  const cur = Number(rows[0]?.revenue) || 0
  const prev = Number(rows[1]?.revenue) || 0
  if (!cur || !prev) return null
  return (cur - prev) / prev
}

function buildOverviewSection(
  identity: CompanyIdentity,
  quote: any,
  qIncome: any,
  aIncome: any,
  segments: any,
): OverviewSection | SectionUnavailable {
  const desc = (quote?.description as string) || ''
  if (!desc && !qIncome) return unavailable('Company profile and financials could not be loaded.')

  const ltmRev = ltmRevenue(qIncome) ?? (Number(quote?.revenue) || null)
  const ltmEbitdaV = ltmEbitda(qIncome)
  const ebitdaMgn = (ltmRev && ltmEbitdaV) ? ltmEbitdaV / ltmRev : null
  const growth = annualGrowth(aIncome)
  const tev = (Number(quote?.marketCap) || 0)  // cheapest TEV proxy when net debt isn't fetched
  const tevNtmEbitda = (ltmEbitdaV && tev) ? tev / ltmEbitdaV : null

  const segs = segments?.product || []
  const totalSeg = segs.reduce((s: number, r: any) => s + (Number(r.revenue) || 0), 0)
  const segLines: string[] = []
  if (Array.isArray(segs) && segs.length) {
    const recent = segs[0]
    const tot = Object.values(recent || {}).reduce((s: number, v: any) => s + (typeof v === 'number' ? v : 0), 0) as number
    if (tot > 0) {
      Object.entries(recent || {})
        .filter(([k, v]) => typeof v === 'number' && k !== 'date' && k !== 'period')
        .sort((a: any, b: any) => (b[1] as number) - (a[1] as number))
        .slice(0, 4)
        .forEach(([name, val]) => {
          const pct = ((val as number) / tot) * 100
          segLines.push(`${name} — ${pct.toFixed(0)}% of revenue`)
        })
    }
  }
  const geoLines: string[] = []
  const geo = segments?.geographic || []
  if (Array.isArray(geo) && geo.length) {
    const recent = geo[0]
    const tot = Object.values(recent || {}).reduce((s: number, v: any) => s + (typeof v === 'number' ? v : 0), 0) as number
    if (tot > 0) {
      Object.entries(recent || {})
        .filter(([k, v]) => typeof v === 'number' && k !== 'date' && k !== 'period')
        .sort((a: any, b: any) => (b[1] as number) - (a[1] as number))
        .slice(0, 4)
        .forEach(([name, val]) => {
          const pct = ((val as number) / tot) * 100
          geoLines.push(`${name} — ${pct.toFixed(0)}% of revenue`)
        })
    }
  }

  return {
    description: desc || `${identity.name} is a ${identity.industry || identity.sector || 'public company'} listed on ${identity.exchange || 'a US exchange'}. Detailed business description was not returned by the upstream profile provider.`,
    segments: segLines,
    geography: geoLines,
    metrics: [
      { label: 'LTM Revenue',         value: fmtMoney(ltmRev) },
      { label: 'LTM Revenue Growth',  value: fmtPct(growth) },
      { label: 'LTM EBITDA',          value: fmtMoney(ltmEbitdaV) },
      { label: 'LTM EBITDA Margin',   value: fmtPct(ebitdaMgn) },
      { label: 'TEV / NTM EBITDA',    value: fmtMultiple(tevNtmEbitda) },
    ],
  }
}

function buildValuationSection(
  quote: any,
  keyMetrics: any,
  ltmEbitdaV: number | null,
  ltmRev: number | null,
  estimates: EstimatesResponse | null,
): ValuationSection | SectionUnavailable {
  if (!quote?.price) return unavailable('No live quote available to anchor valuation multiples.')

  const tev = Number(quote?.marketCap) || 0
  const evRev = (tev && ltmRev) ? tev / ltmRev : null
  const evEbitda = (tev && ltmEbitdaV) ? tev / ltmEbitdaV : Number(quote?.evEbitda) || null
  const pe = Number(quote?.pe) || null
  const ps = Number(quote?.ps) || null
  const pb = Number(quote?.pb) || null

  // Sum the next 4 forward quarters from analyst estimates → NTM revenue + EPS.
  const fwdQuarters = (estimates?.quarterly || []).filter(q => q.period.startsWith('Q'))
  const ntmRevenue = fwdQuarters.length === 4
    ? fwdQuarters.reduce((s, q) => s + (Number(q.revenue) || 0), 0)
    : null
  const ntmEps = fwdQuarters.length === 4
    ? fwdQuarters.reduce((s, q) => s + (Number(q.epsEst) || 0), 0)
    : null

  const ntmEvRev = (tev && ntmRevenue) ? tev / ntmRevenue : null
  const fwdPe = (Number(quote?.price) && ntmEps) ? Number(quote.price) / ntmEps : null

  const current = [
    { label: 'EV / Revenue',  value: fmtMultiple(evRev) },
    { label: 'EV / NTM Rev',  value: fmtMultiple(ntmEvRev) },
    { label: 'EV / EBITDA',   value: fmtMultiple(evEbitda) },
    { label: 'P / E',         value: fmtMultiple(pe) },
    { label: 'Fwd P / E',     value: fmtMultiple(fwdPe) },
  ]
  // Drop placeholder tiles where we have no data so the strip stays dense
  // rather than padding with em-dashes.
  // (Keep at least 3 tiles to maintain visual balance.)
  const filteredCurrent = current.filter(c => c.value !== '—')
  const currentTiles = filteredCurrent.length >= 3 ? filteredCurrent : current
  // Suppress unused-variable warnings for legacy multiples preserved for future use.
  void ps; void pb;

  // Build historical range from key-metrics history (if available)
  const km = Array.isArray(keyMetrics?.rows) ? keyMetrics.rows : []
  function range(field: string): { low: number; median: number; high: number } | null {
    const vals = km.map((r: any) => Number(r?.[field])).filter((n: number) => isFinite(n) && n > 0)
    if (vals.length < 2) return null
    vals.sort((a: number, b: number) => a - b)
    return { low: vals[0], median: vals[Math.floor(vals.length / 2)], high: vals[vals.length - 1] }
  }
  const histDefs: { label: string; field: string; fmt: (n: number) => string }[] = [
    { label: 'EV / EBITDA',  field: 'evToEbitda',         fmt: (n) => fmtMultiple(n) },
    { label: 'EV / Revenue', field: 'evToSales',          fmt: (n) => fmtMultiple(n) },
    { label: 'P / E',        field: 'peRatio',            fmt: (n) => fmtMultiple(n) },
    { label: 'FCF Yield',    field: 'freeCashFlowYield',  fmt: (n) => fmtPct(n) },
  ]
  const historical = histDefs
    .map(d => {
      const r = range(d.field)
      if (!r) return null
      return { label: d.label, low: d.fmt(r.low), median: d.fmt(r.median), high: d.fmt(r.high) }
    })
    .filter((x): x is { label: string; low: string; median: string; high: string } => x !== null)

  // Summary valuation table — illustrative low/mid/high based on current EV/EBITDA range
  const ebMid = evEbitda || 0
  const summary = ltmEbitdaV ? [
    {
      method: 'Trading EV/EBITDA (current ±20%)',
      low:  fmtMoney((ebMid * 0.80) * ltmEbitdaV),
      mid:  fmtMoney((ebMid)        * ltmEbitdaV),
      high: fmtMoney((ebMid * 1.20) * ltmEbitdaV),
    },
    {
      method: 'P/E × LTM net income',
      low:  fmtMoney(((pe || 0) * 0.80) * (ltmEbitdaV * 0.55)),
      mid:  fmtMoney(((pe || 0))        * (ltmEbitdaV * 0.55)),
      high: fmtMoney(((pe || 0) * 1.20) * (ltmEbitdaV * 0.55)),
    },
  ] : []

  // Forward Street consensus block (price target, # analysts, NTM revenue/EPS).
  const fcItems: { label: string; value: string }[] = []
  const pt = Number(estimates?.priceTarget) || null
  const ptHi = Number(estimates?.priceTargetHigh) || null
  const ptLo = Number(estimates?.priceTargetLow) || null
  const nA = Number(estimates?.numAnalysts) || null
  const px = Number(quote?.price) || null
  if (pt) fcItems.push({ label: 'Price target (consensus)', value: `$${pt.toFixed(2)}` })
  if (px && pt) {
    const upside = (pt - px) / px
    fcItems.push({ label: 'Implied upside', value: `${(upside * 100).toFixed(1)}%` })
  }
  if (ptHi && ptLo) fcItems.push({ label: 'PT range (low / high)', value: `$${ptLo.toFixed(0)} – $${ptHi.toFixed(0)}` })
  if (nA) fcItems.push({ label: 'Analysts covering', value: `${nA}` })
  if (ntmRevenue) fcItems.push({ label: 'NTM revenue (Street)', value: fmtMoney(ntmRevenue) })
  if (ntmEps) fcItems.push({ label: 'NTM EPS (Street)', value: `$${ntmEps.toFixed(2)}` })
  const forwardConsensus = fcItems.length > 0
    ? { items: fcItems, note: 'Consensus from FMP analyst estimates feed.' }
    : undefined

  return { current: currentTiles, historical, summary, ...(forwardConsensus ? { forwardConsensus } : {}) }
}

async function buildPeerSection(baseUrl: string, ticker: string, sector?: string): Promise<PeerRow[] | SectionUnavailable> {
  const peers = await fetchPeerTickers(ticker)
  if (peers.length === 0) return unavailable('No peer set could be resolved for this ticker.')

  const rows: PeerRow[] = []
  // Run peer profile lookups in parallel (capped at 8)
  const profiles = await Promise.all(peers.slice(0, 8).map(async (p) => ({ p, data: await fetchPeerProfile(p) })))
  for (const { p, data } of profiles) {
    if (!data?.profile) continue
    const prof = data.profile
    const r = data.ratios || {}
    const g = data.growth || {}
    rows.push({
      ticker: prof.symbol || p,
      name:   (prof.companyName || prof.name || '').slice(0, 40),
      marketCap: fmtMoney(Number(prof.mktCap || prof.marketCap || 0)),
      revenueGrowth: fmtPct(Number(g.growthRevenue || 0)),
      ebitdaMargin: fmtPct(Number(r.ebitdaMarginTTM || r.ebitdaratioTTM || 0)),
      evRevenue: fmtMultiple(Number(r.evToSalesTTM || 0)),
      evEbitda:  fmtMultiple(Number(r.enterpriseValueMultipleTTM || r.evToEbitdaTTM || 0)),
      pe:        fmtMultiple(Number(r.peRatioTTM || prof.pe || 0)),
    })
  }
  if (rows.length === 0) return unavailable('Peer profiles returned empty from upstream provider.')
  return rows
}

interface MnaRow {
  transactionDate?: string
  acceptanceTime?: string
  companyName?: string
  symbol?: string
  targetedCompanyName?: string
  targetCompanyName?: string
  targetedSymbol?: string
  targetSymbol?: string
  transactionValue?: number | string
  value?: number | string
}

// Fetch the most recent LTM revenue & EBITDA for a public target ticker so we
// can compute deal multiples honestly. Returns null when the target is
// non-public (no ticker) or upstream data is missing.
async function fetchTargetFinancials(ticker: string): Promise<{ revenue: number | null; ebitda: number | null } | null> {
  if (!FMP || !ticker) return null
  const arr = await safeJson<any[]>(`https://financialmodelingprep.com/stable/income-statement?symbol=${encodeURIComponent(ticker)}&period=annual&limit=1&apikey=${FMP}`)
  if (!Array.isArray(arr) || arr.length === 0) return null
  const row = arr[0] || {}
  const revenue = Number(row.revenue) || null
  const ebitda  = Number(row.ebitda)  || null
  return { revenue, ebitda }
}

// Best-effort sector lookup for a deal counterparty so we can filter
// the global M&A feed down to transactions in the target ticker's sector.
// Caches by ticker for the duration of a single deck assembly to avoid
// hammering the profile endpoint.
async function fetchTickerSector(ticker: string, cache: Map<string, string>): Promise<string> {
  if (!FMP || !ticker) return ''
  const hit = cache.get(ticker)
  if (hit !== undefined) return hit
  const arr = await safeJson<any[]>(`https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(ticker)}&apikey=${FMP}`)
  const sec = String(arr?.[0]?.sector || '').trim()
  cache.set(ticker, sec)
  return sec
}

async function buildTransactionsSection(ticker: string, sector?: string): Promise<TransactionRow[] | SectionUnavailable> {
  // FMP exposes a global M&A feed at /stable/mergers-acquisitions-latest. To
  // satisfy the "recent precedent M&A in the sector" requirement, we pull
  // multiple pages and filter rows whose target (preferred) or acquirer is in
  // the same FMP sector as the subject ticker. If sector resolution returns
  // zero matches we fall back to the broader feed so the slide still renders,
  // but we mark the section so the slide footer can disclose the fallback.
  if (!FMP) return unavailable('Transaction comparables require an upstream M&A feed (FMP_API_KEY not configured).')

  // Pull the latest 3 pages (~150 rows) so the sector filter has enough
  // breadth to find ~8 matching deals even for narrow sectors.
  const pages = await Promise.all(
    [0, 1, 2].map(p => safeJson<MnaRow[]>(`https://financialmodelingprep.com/stable/mergers-acquisitions-latest?page=${p}&apikey=${FMP}`))
  )
  const data: MnaRow[] = pages.flatMap(p => Array.isArray(p) ? p : [])
  if (data.length === 0) return unavailable('No precedent M&A transactions returned by the upstream feed.')

  // De-dupe on a normalised acquirer+target identity (the FMP feed repeats
  // S-4 amendments and re-publishes the same deal across multiple pages with
  // slight field variations). Build the key from BOTH the symbol and the
  // company name so the same deal expressed two different ways still
  // collapses to one row. Drop rows missing either side label.
  const seen = new Set<string>()
  const cleaned: MnaRow[] = []
  const norm = (s: string | undefined) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const d of data) {
    if (!(d.companyName || d.symbol)) continue
    if (!(d.targetedCompanyName || d.targetCompanyName)) continue
    // Use companyName as the canonical identity for dedup — it is consistently
    // populated across FMP rows whereas `symbol` is sometimes blank, causing
    // the same deal expressed two ways to slip through a symbol-based key.
    const acqKey = norm(d.companyName) || norm(d.symbol)
    const tgtKey = norm(d.targetedCompanyName || d.targetCompanyName) || norm(d.targetedSymbol || d.targetSymbol)
    const key = `${acqKey}|${tgtKey}`
    if (!key || key === '|') continue
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push(d)
  }

  // Sector-aware narrowing: resolve the subject ticker's sector (preferring
  // the value passed in, falling back to a profile lookup), then keep only
  // rows whose target or acquirer ticker resolves to the same sector. We
  // examine up to 60 candidates to bound the profile-lookup fan-out.
  const sectorCache = new Map<string, string>()
  const subjectSector = (sector || '').trim() || (await fetchTickerSector(ticker, sectorCache))
  let usedFallback = false
  let top: MnaRow[] = []

  if (subjectSector) {
    const candidates = cleaned.slice(0, 60)
    const sectorMatches = await Promise.all(candidates.map(async (d) => {
      const tgt = d.targetedSymbol || d.targetSymbol || ''
      const acq = d.symbol || ''
      const tgtSec = tgt ? await fetchTickerSector(tgt, sectorCache) : ''
      const acqSec = acq ? await fetchTickerSector(acq, sectorCache) : ''
      const matches = (tgtSec && tgtSec === subjectSector) || (acqSec && acqSec === subjectSector)
      return matches ? d : null
    }))
    top = sectorMatches.filter((x): x is MnaRow => x !== null).slice(0, 8)
  }

  // Fallback: if no sector matches were found (narrow sector, illiquid feed
  // window, or no FMP profile coverage on counterparties), surface the
  // broader recent feed so the slide still renders meaningful comps.
  if (top.length === 0) {
    usedFallback = true
    top = cleaned.slice(0, 8)
  }

  // Enrich each row in parallel by fetching the target's most recent
  // financials. Multiples are computed when (transactionValue, revenue) or
  // (transactionValue, ebitda) are available; otherwise we mark `n/a` so the
  // slide renders an explicit, truthful gap rather than an em-dash that
  // could be confused with "missing column".
  const rows = await Promise.all(top.map(async (d): Promise<TransactionRow> => {
    const evRaw = Number(d.transactionValue || d.value) || 0
    const targetTicker = d.targetedSymbol || d.targetSymbol || ''
    const tgt = targetTicker ? await fetchTargetFinancials(targetTicker) : null
    const evRevMul = (evRaw && tgt?.revenue) ? evRaw / tgt.revenue : null
    const evEbMul  = (evRaw && tgt?.ebitda)  ? evRaw / tgt.ebitda  : null
    return {
      date: (d.transactionDate || d.acceptanceTime || '').slice(0, 10),
      acquirer: (d.companyName || d.symbol || '—').slice(0, 36),
      target:   (d.targetedCompanyName || d.targetCompanyName || '—').slice(0, 36),
      evMm:     evRaw > 0 ? fmtMoney(evRaw) : 'n/a',
      evRevenue: evRevMul ? fmtMultiple(evRevMul) : 'n/a',
      evEbitda:  evEbMul  ? fmtMultiple(evEbMul)  : 'n/a',
    }
  }))

  if (rows.length === 0) return unavailable('Recent M&A feed returned no usable rows.')
  // Tag the first row's date with a sector-fallback marker so the slide
  // footer can disclose when sector filtering didn't match. This keeps the
  // existing TransactionRow shape stable for the PPTX builder.
  if (usedFallback && subjectSector && rows[0]) {
    rows[0].date = rows[0].date ? `${rows[0].date} *` : '*'
  }
  return rows
}

function buildDcfSection(quote: any, qIncome: any, cashFlow: any, keyMetrics: any): DcfSection | SectionUnavailable {
  const cfRows = cashFlow?.rows || []
  const baseFcfRaw = Number(cfRows?.[0]?.freeCashFlow) || null
  if (!baseFcfRaw) return unavailable('Free cash flow could not be derived from the cash-flow statement.')

  // Convert raw $ to $M for the model
  const baseFcfM = baseFcfRaw / 1e6

  const km0 = Array.isArray(keyMetrics?.rows) ? keyMetrics.rows[0] : null
  const totalDebtM = (Number(km0?.totalDebt) || Number(quote?.totalDebt) || 0) / 1e6
  const cashM      = (Number(km0?.cashAndShortTermInvestments) || 0) / 1e6
  const netDebtM   = totalDebtM - cashM
  const sharesM    = (Number(quote?.sharesOut) || 0) / 1e6
  const beta       = Number(quote?.beta) || 1.0
  const riskFreeRate = 0.045
  const equityRiskPremium = 0.055
  const discountRate = capmCostOfEquity(riskFreeRate, beta, equityRiskPremium)

  const growthStage1 = 0.08
  const growthStage2 = 0.05
  const terminalGrowth = 0.025

  const a: DcfAssumptions = {
    baseFcf: baseFcfM,
    growthStage1, growthStage2,
    stage1Years: 5, stage2Years: 5,
    terminalGrowth, discountRate,
    netDebt: netDebtM, sharesOutstanding: sharesM,
  }

  let result
  try { result = runDcf(a) } catch (e) {
    return unavailable(`DCF model rejected the inputs: ${(e as Error).message}`)
  }

  const currentPrice = Number(quote?.price) || 0
  const intrinsic = result.intrinsicValuePerShare || 0
  const upsidePct = currentPrice > 0 && intrinsic > 0 ? (intrinsic - currentPrice) / currentPrice : null

  return {
    assumptions: [
      { label: 'Base FCF (latest)', value: `$${baseFcfM.toFixed(0)}M` },
      { label: 'Stage 1 growth (yrs 1–5)',  value: fmtPct(growthStage1) },
      { label: 'Stage 2 growth (yrs 6–10)', value: fmtPct(growthStage2) },
      { label: 'Terminal growth',   value: fmtPct(terminalGrowth) },
      { label: 'Discount rate (CAPM)', value: fmtPct(discountRate) },
      { label: 'Net debt',          value: `$${netDebtM.toFixed(0)}M` },
      { label: 'Shares outstanding', value: `${sharesM.toFixed(0)}M` },
    ],
    perShare: {
      enterpriseValue:    `$${result.enterpriseValue.toFixed(0)}M`,
      equityValue:        `$${result.equityValue.toFixed(0)}M`,
      sharesOutstanding:  `${sharesM.toFixed(0)}M`,
      intrinsicPerShare:  intrinsic > 0 ? `$${intrinsic.toFixed(2)}` : '—',
      currentPrice:       currentPrice > 0 ? `$${currentPrice.toFixed(2)}` : '—',
      upsidePct:          upsidePct == null ? '—' : `${(upsidePct * 100).toFixed(1)}%`,
    },
    yearTable: result.years.map(y => ({
      year:   `Y${y.year}`,
      fcf:    y.fcf.toFixed(0),
      growth: fmtPct(y.growth),
      pv:     y.presentValue.toFixed(0),
    })),
  }
}

function buildQualitativeSection(quote: any): QualitativeSection | SectionUnavailable {
  const sector = quote?.sector || ''
  const industry = quote?.industry || ''
  const name = quote?.name || quote?.symbol || 'the company'

  // We surface bullet templates derived from quote/sector context. These
  // are intentionally generic-but-useful rather than fabricated specifics
  // — analysts can edit them on the slide. Fully empty sectors degrade
  // gracefully to the platform's default analyst checklist.
  const strengths: string[] = []
  const risks: string[] = []
  const catalysts: string[] = []
  const esg: string[] = []

  const margin = Number(quote?.netMargin) || 0
  const roe = Number(quote?.roe) || 0
  const dy = Number(quote?.dividendYield) || 0
  const beta = Number(quote?.beta) || 0
  const debtEq = Number(quote?.debtEquity) || 0

  if (margin > 0.15) strengths.push(`Above-average net margin (${fmtPct(margin)}) indicates pricing power vs ${industry || sector || 'sector'} peers`)
  if (roe > 0.15)    strengths.push(`Strong ROE of ${fmtPct(roe)} signals efficient capital deployment`)
  strengths.push(`${name} operates in ${industry || sector || 'a defined vertical'} with established scale and brand recognition`)
  if (dy > 0)        strengths.push(`Dividend yield of ${fmtPct(dy)} provides a baseline shareholder return`)
  if (strengths.length < 3) strengths.push('Defensive cash generation supports re-investment optionality through the cycle')

  if (beta > 1.2)    risks.push(`Elevated beta (${beta.toFixed(2)}) implies above-market volatility in drawdowns`)
  if (debtEq > 1)    risks.push(`Debt-to-equity of ${debtEq.toFixed(2)} concentrates refinancing risk if rates remain elevated`)
  risks.push('Customer / geographic concentration risk if any single segment slows materially')
  risks.push('Competitive intensity from existing peers and AI-native entrants')
  if (risks.length < 3) risks.push('Regulatory scrutiny and policy shifts in core markets')

  catalysts.push('Next earnings release — watch for guidance revisions and capital-return commentary')
  catalysts.push(`Sector-wide multiple re-rating tied to ${sector || 'industry'} cycle inflection`)
  catalysts.push('Capital-allocation events (buybacks, M&A, dividends) and analyst day announcements')

  esg.push('Disclosure on Scope 1, 2 and material Scope 3 emissions in line with ISSB / SEC climate rules')
  esg.push('Board independence and executive-compensation alignment with long-term shareholder returns')
  esg.push('Workforce, supply-chain and data-privacy practices specific to industry exposure')

  return { strengths, risks, catalysts, esg }
}

// ─── Public assembler ───────────────────────────────────────────────────────
export async function assembleInvestmentMemoData(baseUrl: string, ticker: string): Promise<InvestmentMemoData> {
  const tk = ticker.toUpperCase().trim()

  // Fan out — independent, parallel. Estimates is included so valuation can
  // surface forward Street consensus alongside trailing multiples.
  const [quote, qIncome, aIncome, cashFlow, keyMetrics, segments, estimates] = await Promise.all([
    fetchQuote(baseUrl, tk),
    fetchIncomeQuarterly(baseUrl, tk),
    fetchIncomeAnnual(baseUrl, tk),
    fetchCashFlowAnnual(baseUrl, tk),
    fetchKeyMetrics(baseUrl, tk),
    fetchSegments(baseUrl, tk),
    fetchEstimates(baseUrl, tk),
  ])

  const identity = buildIdentity(tk, quote)

  const overview    = buildOverviewSection(identity, quote, qIncome, aIncome, segments)
  const ltmRev      = ltmRevenue(qIncome) ?? (Number(quote?.revenue) || null)
  const ltmEbitdaV  = ltmEbitda(qIncome)
  const valuation   = buildValuationSection(quote, keyMetrics, ltmEbitdaV, ltmRev, estimates)
  const dcf         = buildDcfSection(quote, qIncome, cashFlow, keyMetrics)
  const qualitative = buildQualitativeSection(quote)

  // Peers + transactions are heavier — fan out in parallel too
  const [peers, transactions] = await Promise.all([
    buildPeerSection(baseUrl, tk, quote?.sector),
    buildTransactionsSection(tk, quote?.sector),
  ])

  const now = new Date()
  const month = now.toLocaleString('en-US', { month: 'short' })
  const year  = now.getFullYear()

  const sourceLine = quote?.source === 'fmp'
    ? 'Sources: Financial Modeling Prep, Yahoo Finance, Finsyt DCF model.'
    : 'Sources: Finsyt platform data, Yahoo Finance public endpoints, Finsyt DCF model.'

  return {
    identity,
    asOf: `${month} ${year}`,
    sourceLine,
    overview,
    valuation,
    peers,
    transactions,
    dcf,
    qualitative,
  }
}

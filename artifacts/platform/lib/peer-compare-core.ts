/**
 * Peer-comparison core
 * ────────────────────
 * Shared types, metric ordering, formatting helpers and the per-symbol row
 * builder used by BOTH the `/api/peers/compare` aggregator and the
 * pitch-deck assembler (`lib/peer-comparison-deck.ts`).
 *
 * The row builder pulls REAL provider data wherever the platform exposes it:
 *   - quote-derived fundamentals (mcap, P/E, P/S, EV/EBITDA, margins, …)
 *     come straight from `/api/quote`.
 *   - forward P/E is computed from the FMP analyst-estimates feed
 *     (`/api/estimates`) when a forward EPS consensus is available — price ÷
 *     next-fiscal-year consensus EPS. When no estimate is available it falls
 *     back to a deterministic synthetic number flagged `demo: true`.
 *
 * Two institutional extras still have no first-party real source wired
 * (NTM EV/EBITDA and % options in-the-money), so they remain deterministic
 * `demo: true` cells. Nothing is ever silently faked — every synthetic cell
 * carries `demo: true` and `buildMetricsMeta` marks any column that contains
 * a synthetic cell so the UI / deck can badge it.
 */

export type CompareCell = { value: number | null; display: string; demo?: boolean }
export type CompareRow = {
  symbol: string
  name: string
  ok: boolean
  cells: Record<string, CompareCell>
}
export type CompareMetricMeta = { key: string; label: string; demo: boolean; ntm: boolean }

export const METRIC_ORDER = [
  'price', 'changePct', 'marketCap', 'pe', 'forwardPe',
  'ps', 'evEbitda', 'evEbitdaNtm', 'grossMargin', 'netMargin',
  'roe', 'debtEquity', 'dividendYield', 'optionsItmPct',
] as const
export type MetricKey = (typeof METRIC_ORDER)[number]

export const METRIC_LABELS: Record<string, string> = {
  price: 'Price',
  changePct: 'Change %',
  marketCap: 'Market Cap',
  pe: 'P/E',
  forwardPe: 'P/E (Fwd)',
  ps: 'P/S',
  evEbitda: 'EV / EBITDA',
  evEbitdaNtm: 'EV / EBITDA (NTM)',
  grossMargin: 'Gross Margin',
  netMargin: 'Net Margin',
  roe: 'ROE',
  debtEquity: 'Debt / Equity',
  dividendYield: 'Div Yield',
  optionsItmPct: '% Options ITM',
}

// Forward / next-twelve-months metrics — rendered with the "NTM" sub-label
// in the UI and deck (vs. "LTM" for trailing metrics). A metric being NTM is
// independent of whether its cells are real or demo.
export const NTM_METRICS = new Set<string>(['forwardPe', 'evEbitdaNtm', 'optionsItmPct'])

export function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export function fmtMcap(v: number | null): string {
  if (v == null) return '—'
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'
  if (v >= 1e9)  return '$' + (v / 1e9).toFixed(1)  + 'B'
  if (v >= 1e6)  return '$' + (v / 1e6).toFixed(1)  + 'M'
  return '$' + v.toLocaleString()
}
export function fmtPx(v: number | null): string { return v == null ? '—' : '$' + v.toFixed(2) }
export function fmtPct(v: number | null, digits = 2): string { return v == null ? '—' : v.toFixed(digits) + '%' }
export function fmtMult(v: number | null): string { return v == null ? '—' : v.toFixed(1) + 'x' }
export function fmtRatio(v: number | null): string { return v == null ? '—' : v.toFixed(2) }

// Stable hash of the symbol — drives deterministic demo numbers so the same
// ticker always renders the same synthesised cells. Not used for any real
// pricing or risk decision.
function symbolHash(symbol: string): number {
  let h = 2166136261
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h
}

function synth(symbol: string, key: string, base: number, spread: number, decimals = 1): number {
  const h = symbolHash(symbol + ':' + key)
  const t = (h % 1000) / 1000
  const v = base + (t - 0.5) * spread * 2
  return Number(v.toFixed(decimals))
}

async function safeFetch(url: string): Promise<any> {
  try {
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}

/**
 * Resolve the forward (next-fiscal-year) consensus EPS for a symbol from the
 * estimates bundle returned by `/api/estimates`. Picks the earliest annual
 * estimate row dated today-or-later. Returns null when no forward estimate
 * is available.
 */
function forwardEpsFromEstimates(est: any): number | null {
  const annual: any[] = Array.isArray(est?.estimatesAnnual) ? est.estimatesAnnual : []
  if (annual.length === 0) return null
  const today = new Date().toISOString().slice(0, 10)
  const fwdRow = annual
    .filter((r) => String(r?.date || '') >= today)
    .sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || '')))[0]
  return num(fwdRow?.epsAvg ?? fwdRow?.estimatedEpsAvg)
}

/**
 * Build a single peer row from the platform's own provider routes.
 * `baseUrl` should be an origin (optionally including the platform base path)
 * that resolves `/api/quote` and `/api/estimates`.
 */
export async function buildPeerRow(baseUrl: string, symbol: string): Promise<CompareRow> {
  const [q, est] = await Promise.all([
    safeFetch(`${baseUrl}/api/quote?symbol=${encodeURIComponent(symbol)}`),
    safeFetch(`${baseUrl}/api/estimates?symbol=${encodeURIComponent(symbol)}`),
  ])
  const quote = q?.quote || q || null
  const cells: Record<string, CompareCell> = {}

  // ── Real cells from the platform quote route ────────────────────────────
  const price         = num(quote?.price)
  const changePct     = num(quote?.changePct)
  const marketCap     = num(quote?.marketCap)
  const pe            = num(quote?.pe)
  const ps            = num(quote?.ps)
  const evEbitda      = num(quote?.evEbitda)
  const grossMargin   = num(quote?.grossMargin)
  const netMargin     = num(quote?.netMargin)
  const roe           = num(quote?.roe)
  const debtEquity    = num(quote?.debtEquity)
  const dividendYield = num(quote?.dividendYield)

  cells.price         = { value: price,         display: fmtPx(price) }
  cells.changePct     = { value: changePct,     display: changePct == null ? '—' : (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%' }
  cells.marketCap     = { value: marketCap,     display: fmtMcap(marketCap) }
  cells.pe            = { value: pe,            display: fmtMult(pe) }
  cells.ps            = { value: ps,            display: fmtMult(ps) }
  cells.evEbitda      = { value: evEbitda,      display: fmtMult(evEbitda) }
  cells.grossMargin   = { value: grossMargin,   display: grossMargin == null ? '—' : fmtPct(grossMargin < 1.5 ? grossMargin * 100 : grossMargin) }
  cells.netMargin     = { value: netMargin,     display: netMargin   == null ? '—' : fmtPct(netMargin   < 1.5 ? netMargin   * 100 : netMargin) }
  cells.roe           = { value: roe,           display: roe         == null ? '—' : fmtPct(roe         < 1.5 ? roe         * 100 : roe) }
  cells.debtEquity    = { value: debtEquity,    display: fmtRatio(debtEquity) }
  cells.dividendYield = { value: dividendYield, display: fmtPct(dividendYield) }

  // ── Forward P/E: REAL when the estimates feed gives us a forward EPS ─────
  // (price ÷ next-FY consensus EPS); otherwise a deterministic demo cell.
  const fwdEps = forwardEpsFromEstimates(est)
  if (price != null && fwdEps != null && fwdEps > 0) {
    const v = Number((price / fwdEps).toFixed(1))
    cells.forwardPe = { value: v, display: fmtMult(v) }
  } else {
    const fwdPeBase = pe != null ? pe * 0.92 : 22
    const v = synth(symbol, 'fwdPe', fwdPeBase, fwdPeBase * 0.18, 1)
    cells.forwardPe = { value: v, display: fmtMult(v), demo: true }
  }

  // ── No first-party real source wired yet — stay deterministic demo ──────
  // Anchored on the matching real metric where possible so the demo number
  // stays in a believable range.
  const ntmEvBase = evEbitda != null ? evEbitda * 0.95 : 14
  const evEbitdaNtm = synth(symbol, 'ntmEv', ntmEvBase, ntmEvBase * 0.18, 1)
  const optionsItm  = synth(symbol, 'itm', 62, 18, 1)
  cells.evEbitdaNtm   = { value: evEbitdaNtm, display: fmtMult(evEbitdaNtm), demo: true }
  cells.optionsItmPct = { value: optionsItm,  display: fmtPct(optionsItm),   demo: true }

  return {
    symbol,
    name: quote?.name || symbol,
    ok: !!price,
    cells,
  }
}

/**
 * Build the per-column metadata for a comparison. A column is flagged
 * `demo: true` only when at least one of its cells is actually synthetic —
 * so a forward-P/E column populated entirely from the estimates feed is NOT
 * badged, while NTM EV/EBITDA (always synthetic today) always is.
 */
export function buildMetricsMeta(keys: readonly string[], rows: CompareRow[]): CompareMetricMeta[] {
  return keys.map((key) => ({
    key,
    label: METRIC_LABELS[key] ?? key,
    demo: rows.some((r) => r.cells[key]?.demo === true),
    ntm: NTM_METRICS.has(key),
  }))
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, asc, eq } from 'drizzle-orm'
import {
  withClerkContext,
  peerSetsTable,
  peerSetMembersTable,
} from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// /api/peers/compare — workspace-scoped peer comparison aggregator.
//
// Inputs (POST JSON or GET querystring):
//   - setId          uuid of an existing peer_set the user can read, OR
//   - symbols        explicit comma-separated tickers (max 12)
//   - subject        optional "anchor" ticker rendered first (matches the
//                    institutional Selected Peers table layout)
//   - metrics        optional comma list to project a subset (default: all)
//
// Output: per-peer rows with quote-derived REAL fields (mcap, pe, ps,
// margins, growth) plus deterministic SYNTHESISED demo cells for institutional
// extras (NTM EV/EBITDA, forward P/E, % exercisable in‑the‑money options).
// The synthesised cells are flagged `demo: true` in the response so the UI
// can render the amber "demo" badge required by the task spec — we never
// pretend these are sourced from a paid feed.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SYMBOL_RE = /^[A-Z0-9.\-]{1,15}$/

type CompareCell = { value: number | null; display: string; demo?: boolean }
type CompareRow = {
  symbol: string
  name: string
  ok: boolean
  cells: Record<string, CompareCell>
}

const METRIC_ORDER = [
  'price', 'changePct', 'marketCap', 'pe', 'forwardPe',
  'ps', 'evEbitda', 'evEbitdaNtm', 'grossMargin', 'netMargin',
  'roe', 'debtEquity', 'dividendYield', 'optionsItmPct',
] as const

const REAL_METRICS = new Set<string>(['price', 'changePct', 'marketCap', 'pe', 'ps', 'evEbitda', 'grossMargin', 'netMargin', 'roe', 'debtEquity', 'dividendYield'])

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function fmtMcap(v: number | null): string {
  if (v == null) return '—'
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'
  if (v >= 1e9)  return '$' + (v / 1e9).toFixed(1)  + 'B'
  if (v >= 1e6)  return '$' + (v / 1e6).toFixed(1)  + 'M'
  return '$' + v.toLocaleString()
}
function fmtPx(v: number | null): string { return v == null ? '—' : '$' + v.toFixed(2) }
function fmtPct(v: number | null, digits = 2): string { return v == null ? '—' : v.toFixed(digits) + '%' }
function fmtMult(v: number | null): string { return v == null ? '—' : v.toFixed(1) + 'x' }
function fmtRatio(v: number | null): string { return v == null ? '—' : v.toFixed(2) }

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

async function fetchOne(baseUrl: string, symbol: string): Promise<CompareRow> {
  const q = await safeFetch(`${baseUrl}/api/quote?symbol=${encodeURIComponent(symbol)}`)
  const quote = q?.quote || q || null
  const cells: Record<string, CompareCell> = {}

  // Real cells from the platform quote route.
  const price        = num(quote?.price)
  const changePct    = num(quote?.changePct)
  const marketCap    = num(quote?.marketCap)
  const pe           = num(quote?.pe)
  const ps           = num(quote?.ps)
  const evEbitda     = num(quote?.evEbitda)
  const grossMargin  = num(quote?.grossMargin)
  const netMargin    = num(quote?.netMargin)
  const roe          = num(quote?.roe)
  const debtEquity   = num(quote?.debtEquity)
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

  // Deterministic demo cells for the institutional Selected Peers table.
  // Anchored on the matching real metric where possible so the demo number
  // stays in a believable range (forward P/E ≈ trailing P/E ± 15%).
  const fwdPeBase = pe != null ? pe * 0.92 : 22
  const ntmEvBase = evEbitda != null ? evEbitda * 0.95 : 14
  const forwardPe   = synth(symbol, 'fwdPe',  fwdPeBase, fwdPeBase * 0.18, 1)
  const evEbitdaNtm = synth(symbol, 'ntmEv',  ntmEvBase, ntmEvBase * 0.18, 1)
  const optionsItm  = synth(symbol, 'itm',    62,        18,                1)

  cells.forwardPe    = { value: forwardPe,   display: fmtMult(forwardPe),   demo: true }
  cells.evEbitdaNtm  = { value: evEbitdaNtm, display: fmtMult(evEbitdaNtm), demo: true }
  cells.optionsItmPct = { value: optionsItm, display: fmtPct(optionsItm),   demo: true }

  return {
    symbol,
    name: quote?.name || symbol,
    ok: !!price,
    cells,
  }
}

async function loadSet(orgId: string, userId: string, setId: string) {
  return await withClerkContext(orgId, userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(peerSetsTable)
      .where(and(eq(peerSetsTable.id, setId), eq(peerSetsTable.orgId, orgId)))
      .limit(1)
    if (!row) return null
    const members = await tx
      .select()
      .from(peerSetMembersTable)
      .where(and(eq(peerSetMembersTable.setId, setId), eq(peerSetMembersTable.orgId, orgId)))
      .orderBy(asc(peerSetMembersTable.position))
    return { set: row, symbols: members.map((m) => m.symbol) }
  })
}

function parseSymbols(raw: string | null | undefined, max = 12): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of raw.split(',').map((x) => x.trim().toUpperCase())) {
    if (!s || !SYMBOL_RE.test(s) || seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= max) break
  }
  return out
}

async function handle(req: NextRequest, body: { setId?: string; symbols?: string[] | string; subject?: string; metrics?: string[] | string }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let symbols: string[] = []
  let setName: string | null = null
  let setId: string | null = null

  if (body.setId) {
    if (!UUID_RE.test(body.setId)) return NextResponse.json({ error: 'Invalid setId' }, { status: 400 })
    if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 409 })
    const detail = await loadSet(orgId, userId, body.setId)
    if (!detail) return NextResponse.json({ error: 'Set not found' }, { status: 404 })
    symbols = detail.symbols
    setName = detail.set.name
    setId = detail.set.id
  } else {
    const raw = Array.isArray(body.symbols) ? body.symbols.join(',') : (body.symbols || '')
    symbols = parseSymbols(raw)
  }

  const subject = typeof body.subject === 'string' && SYMBOL_RE.test(body.subject.toUpperCase())
    ? body.subject.toUpperCase()
    : null

  if (subject) {
    symbols = [subject, ...symbols.filter((s) => s !== subject)]
  }
  symbols = symbols.slice(0, 12)
  if (symbols.length === 0) {
    return NextResponse.json({ error: 'No symbols to compare' }, { status: 400 })
  }

  const metricsFilter: string[] | null = (() => {
    const raw = Array.isArray(body.metrics) ? body.metrics.join(',') : (body.metrics || '')
    if (!raw) return null
    const set = new Set(raw.split(',').map((x) => x.trim()).filter(Boolean))
    return Array.from(set)
  })()

  const rows = await Promise.all(symbols.map((s) => fetchOne(req.nextUrl.origin, s)))
  const metrics = (metricsFilter ?? METRIC_ORDER).filter((m) => METRIC_ORDER.includes(m as any))

  return NextResponse.json({
    setId,
    setName,
    subject,
    symbols,
    metrics,
    metricsMeta: metrics.map((key) => ({
      key,
      label: METRIC_LABELS[key] ?? key,
      demo: !REAL_METRICS.has(key),
    })),
    rows,
    fetchedAt: Date.now(),
  })
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  return handle(req, {
    setId: sp.get('setId') || undefined,
    symbols: sp.get('symbols') || undefined,
    subject: sp.get('subject') || undefined,
    metrics: sp.get('metrics') || undefined,
  })
}

export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch {}
  return handle(req, body)
}

const METRIC_LABELS: Record<string, string> = {
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

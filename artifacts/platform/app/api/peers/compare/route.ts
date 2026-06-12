import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, asc, eq } from 'drizzle-orm'
import {
  withClerkContext,
  peerSetsTable,
  peerSetMembersTable,
} from '@workspace/db'
import {
  METRIC_ORDER,
  buildPeerRow,
  buildMetricsMeta,
} from '@/lib/peer-compare-core'

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
// margins, growth). Forward P/E is REAL when the FMP analyst-estimates feed
// has a forward consensus EPS (price ÷ fwd EPS); otherwise it falls back to a
// deterministic synthetic cell flagged `demo: true`. NTM EV/EBITDA and
// % options ITM have no first-party real source wired yet and stay `demo`.
// Every synthetic cell carries `demo: true`; `metricsMeta[].demo` flags a
// column only when it actually contains a synthetic cell so the UI can render
// the amber "demo" badge — we never pretend synthetic values come from a
// paid feed.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SYMBOL_RE = /^[A-Z0-9.\-]{1,15}$/

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

  const rows = await Promise.all(symbols.map((s) => buildPeerRow(req.nextUrl.origin, s)))
  const metrics = (metricsFilter ?? [...METRIC_ORDER]).filter((m) => (METRIC_ORDER as readonly string[]).includes(m))

  return NextResponse.json({
    setId,
    setName,
    subject,
    symbols,
    metrics,
    metricsMeta: buildMetricsMeta(metrics, rows),
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

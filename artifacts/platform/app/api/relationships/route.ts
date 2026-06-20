import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── Relationship / entity-map aggregator ─────────────────────────────────────
// GET /api/relationships?symbol=AAPL
//
// Assembles a normalized { nodes, edges } graph for a single subject company
// from data the platform ALREADY has:
//   - subject profile + CEO       → /api/quote          (source: quote.source)
//   - top institutional holders   → /api/ownership      (source: ownership.source)
//   - business segments           → /api/segments       (source: 'fiscal.ai')
//   - peers                       → /api/peers/sets      (source: 'peer_set')
//                                    fallback heuristic  (source: 'suggested')
//   - named executives            → FMP key-executives  (source: 'fmp')
//                                    fallback quote.ceo  (source: quote.source)
//
// Every node and edge carries a `source` attribution string. Branches with no
// available data are omitted entirely (the UI renders per-branch empty hints),
// never surfaced as an error. The route never throws on a missing upstream —
// each branch degrades independently.

type NodeType = 'company' | 'peer' | 'holder' | 'segment' | 'exec'
type EdgeType = 'peer' | 'owns' | 'segment' | 'exec'

interface GraphNode {
  id: string
  type: NodeType
  label: string
  sublabel?: string
  source?: string
  meta?: Record<string, unknown>
}
interface GraphEdge {
  from: string
  to: string
  type: EdgeType
  label?: string
  source?: string
}

const FMP = process.env.FMP_API_KEY || ''

// Suggested peer baskets — mirrors the heuristic in the company peers page so
// the graph always has a peer branch even before a workspace set is saved.
const SUGGESTED_PEERS: Record<string, string[]> = {
  AAPL:  ['MSFT', 'GOOGL', 'META'],
  MSFT:  ['AAPL', 'GOOGL', 'AMZN'],
  GOOGL: ['MSFT', 'META', 'AMZN'],
  NVDA:  ['AMD', 'AVGO', 'INTC'],
  META:  ['GOOGL', 'SNAP', 'PINS'],
  AMZN:  ['MSFT', 'GOOGL', 'WMT'],
  TSLA:  ['F', 'GM', 'RIVN'],
}

async function safeJson(url: string, init?: RequestInit): Promise<any> {
  try {
    const r = await fetch(url, init)
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

// Resolve peers for the subject: prefer a workspace peer-set the caller can
// read that contains the symbol, otherwise fall back to the suggested basket.
async function resolvePeers(
  origin: string,
  cookie: string | null,
  sym: string,
): Promise<{ symbols: string[]; source: string } | null> {
  const setsResp = await safeJson(`${origin}/api/peers/sets`, {
    headers: cookie ? { cookie } : undefined,
    cache: 'no-store',
  })
  const sets: Array<{ name?: string; symbols?: string[] }> = setsResp?.sets || []
  const containing = sets.find((s) => Array.isArray(s.symbols) && s.symbols.includes(sym))
  if (containing && containing.symbols) {
    const peers = containing.symbols.filter((s) => s.toUpperCase() !== sym).slice(0, 8)
    if (peers.length) return { symbols: peers, source: 'peer_set' }
  }
  const suggested = SUGGESTED_PEERS[sym]
  if (suggested && suggested.length) return { symbols: suggested.slice(0, 8), source: 'suggested' }
  return null
}

// Named executives from FMP. Falls back to null so the caller can use the
// quote CEO instead. Never throws.
async function fetchExecutives(sym: string): Promise<Array<{ name: string; title: string; pay?: number }> | null> {
  if (!FMP) return null
  const data = await safeJson(
    `https://financialmodelingprep.com/api/v3/key-executives/${encodeURIComponent(sym)}?apikey=${FMP}`,
    { next: { revalidate: 86400 } },
  )
  if (!Array.isArray(data) || data.length === 0) return null
  return data
    .map((e: any) => ({ name: e?.name || '', title: e?.title || '', pay: Number(e?.pay) || undefined }))
    .filter((e) => e.name)
    .slice(0, 6)
}

export async function GET(req: NextRequest) {
  const sym = (req.nextUrl.searchParams.get('symbol') || '').trim().toUpperCase()
  if (!sym) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  const origin = req.nextUrl.origin
  const cookie = req.headers.get('cookie')

  const [quote, ownership, segments, peers, execs] = await Promise.all([
    safeJson(`${origin}/api/quote?symbol=${encodeURIComponent(sym)}`),
    safeJson(`${origin}/api/ownership?symbol=${encodeURIComponent(sym)}&limit=8`),
    safeJson(`${origin}/api/segments?symbol=${encodeURIComponent(sym)}`),
    resolvePeers(origin, cookie, sym),
    fetchExecutives(sym),
  ])

  const subjectName: string = quote?.name || sym
  const quoteSource: string = quote?.source || 'none'

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // ── Subject (center) ──────────────────────────────────────────────────────
  const subjectId = `co:${sym}`
  nodes.push({
    id: subjectId,
    type: 'company',
    label: sym,
    sublabel: subjectName,
    source: quoteSource,
    meta: {
      name: subjectName,
      sector: quote?.sector || null,
      industry: quote?.industry || null,
      marketCap: quote?.marketCap ?? null,
      exchange: quote?.exchange || null,
    },
  })

  // ── Peers ─────────────────────────────────────────────────────────────────
  if (peers && peers.symbols.length) {
    for (const p of peers.symbols) {
      const ps = p.toUpperCase()
      const id = `peer:${ps}`
      nodes.push({ id, type: 'peer', label: ps, source: peers.source, meta: { symbol: ps } })
      edges.push({ from: subjectId, to: id, type: 'peer', label: 'Peer', source: peers.source })
    }
  }

  // ── Institutional holders ──────────────────────────────────────────────────
  const holders: any[] = Array.isArray(ownership?.holders) ? ownership.holders : []
  if (holders.length) {
    const ownSource = ownership?.source || 'fmp'
    holders.slice(0, 8).forEach((h: any, i: number) => {
      if (!h?.name) return
      const id = `holder:${i}`
      const shares = Number(h.shares) || 0
      nodes.push({
        id,
        type: 'holder',
        label: h.name,
        sublabel: shares ? `${(shares / 1e6).toFixed(1)}M sh` : undefined,
        source: ownSource,
        meta: {
          name: h.name,
          shares: h.shares ?? null,
          value: h.value ?? null,
          change: h.change ?? null,
          changePct: h.changePct ?? null,
          dateReported: h.dateReported ?? ownership?.asOf ?? null,
        },
      })
      edges.push({ from: id, to: subjectId, type: 'owns', label: 'Holds', source: ownSource })
    })
  }

  // ── Business segments (fiscal.ai) ──────────────────────────────────────────
  const segGroups: any[] = segments?.ok && Array.isArray(segments?.annual?.groups) ? segments.annual.groups : []
  const segNames: Array<{ name: string; value: number | null }> = []
  for (const g of segGroups) {
    for (const m of g?.metrics || []) {
      if (m?.type !== 'Segment') continue
      const vals = Array.isArray(m?.values) ? m.values : []
      const last = [...vals].reverse().find((v: any) => v?.value != null)
      segNames.push({ name: m.name, value: last?.value ?? null })
    }
  }
  // Rank by latest reported value (largest segments first), cap at 6.
  segNames.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  const topSegments = segNames.slice(0, 6)
  if (topSegments.length) {
    const segSource = segments?.source || 'fiscal.ai'
    topSegments.forEach((s, i) => {
      const id = `seg:${i}`
      nodes.push({
        id,
        type: 'segment',
        label: s.name,
        sublabel: s.value != null ? fmtMoney(s.value) : undefined,
        source: segSource,
        meta: { name: s.name, value: s.value, currency: segments?.reportingCurrency || 'USD' },
      })
      edges.push({ from: subjectId, to: id, type: 'segment', label: 'Segment', source: segSource })
    })
  }

  // ── Executives ─────────────────────────────────────────────────────────────
  if (execs && execs.length) {
    execs.forEach((e, i) => {
      const id = `exec:${i}`
      nodes.push({
        id,
        type: 'exec',
        label: e.name,
        sublabel: e.title,
        source: 'fmp',
        meta: { name: e.name, title: e.title, pay: e.pay ?? null },
      })
      edges.push({ from: id, to: subjectId, type: 'exec', label: e.title || 'Executive', source: 'fmp' })
    })
  } else if (quote?.ceo) {
    const id = 'exec:0'
    nodes.push({
      id,
      type: 'exec',
      label: quote.ceo,
      sublabel: 'Chief Executive Officer',
      source: quoteSource,
      meta: { name: quote.ceo, title: 'Chief Executive Officer' },
    })
    edges.push({ from: id, to: subjectId, type: 'exec', label: 'CEO', source: quoteSource })
  }

  return NextResponse.json({
    symbol: sym,
    name: subjectName,
    sources: {
      quote: quoteSource,
      ownership: ownership?.source || 'none',
      segments: segGroups.length ? (segments?.source || 'fiscal.ai') : 'none',
      peers: peers?.source || 'none',
      executives: execs && execs.length ? 'fmp' : quote?.ceo ? quoteSource : 'none',
    },
    nodes,
    edges,
  })
}

function fmtMoney(n: number): string {
  const v = Number(n)
  if (!isFinite(v) || v === 0) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'
  if (abs >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'
  if (abs >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M'
  if (abs >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
  return '$' + v.toFixed(0)
}

'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Drawer, Badge, EmptyState } from '@/components/ui'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// ── Types (mirror /api/relationships) ────────────────────────────────────────
type NodeType = 'company' | 'peer' | 'holder' | 'segment' | 'exec'
type EdgeType = 'peer' | 'owns' | 'segment' | 'exec'

interface GraphNode {
  id: string
  type: NodeType
  label: string
  sublabel?: string
  source?: string
  meta?: Record<string, any>
}
interface GraphEdge {
  from: string
  to: string
  type: EdgeType
  label?: string
  source?: string
}
interface GraphPayload {
  symbol: string
  name: string
  sources: Record<string, string>
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// ── Type → colour mapping (design-system CSS vars) ───────────────────────────
const TYPE_META: Record<NodeType, { color: string; label: string }> = {
  company: { color: 'var(--accent)', label: 'Company' },
  peer:    { color: '#7DA1FF',       label: 'Peers' },
  holder:  { color: 'var(--pos)',    label: 'Institutional holders' },
  segment: { color: 'var(--violet)', label: 'Business segments' },
  exec:    { color: 'var(--amber)',  label: 'Executives' },
}
const EDGE_TYPE_NODE: Record<EdgeType, NodeType> = {
  peer: 'peer', owns: 'holder', segment: 'segment', exec: 'exec',
}

// Angular sectors (degrees) for each peripheral branch so each relationship
// type occupies a distinct arc around the subject. 0° = right, clockwise.
const SECTORS: Record<Exclude<NodeType, 'company'>, [number, number]> = {
  peer:    [-65, 65],     // right
  holder:  [115, 245],    // left
  segment: [70, 110],     // bottom
  exec:    [250, 290],    // top
}

const VIEW_W = 900
const VIEW_H = 600

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function fmtUsd(n: any) {
  if (n == null || !isFinite(Number(n)) || Number(n) === 0) return '—'
  const v = Number(n)
  if (Math.abs(v) >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'
  if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
  return '$' + v.toLocaleString()
}
function fmtShares(n: any) {
  const v = Number(n)
  if (!v) return '—'
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K'
  return String(v)
}

interface Placed extends GraphNode { x: number; y: number; r: number }

export default function RelationshipsTab({ symbol }: { symbol: string }) {
  const router = useRouter()
  const SYM = (symbol || '').toUpperCase()
  const [data, setData] = useState<GraphPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<GraphNode | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setData(null)
    fetch(`${BASE}/api/relationships?symbol=${encodeURIComponent(SYM)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((j: GraphPayload) => { if (!cancelled) setData(j) })
      .catch((e) => { if (!cancelled) setError(String(e?.message || e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [SYM])

  // ── Radial layout ──────────────────────────────────────────────────────────
  const { placed, byId } = useMemo(() => {
    const out: Placed[] = []
    const map = new Map<string, Placed>()
    if (!data) return { placed: out, byId: map }
    const cx = VIEW_W / 2
    const cy = VIEW_H / 2
    const subject = data.nodes.find(n => n.type === 'company')
    if (subject) {
      const p: Placed = { ...subject, x: cx, y: cy, r: 40 }
      out.push(p); map.set(p.id, p)
    }
    const branches: Exclude<NodeType, 'company'>[] = ['peer', 'holder', 'segment', 'exec']
    for (const bt of branches) {
      const group = data.nodes.filter(n => n.type === bt)
      if (!group.length) continue
      const [a0, a1] = SECTORS[bt]
      const span = a1 - a0
      // Ring radius grows slightly with crowding so labels stay legible.
      const ring = group.length > 5 ? 235 : 205
      group.forEach((n, i) => {
        // Even angular spacing inside the sector, padded from the edges.
        const t = group.length === 1 ? 0.5 : (i + 0.5) / group.length
        const deg = a0 + span * t
        const { x, y } = polar(cx, cy, ring, deg)
        const p: Placed = { ...n, x, y, r: 22 }
        out.push(p); map.set(p.id, p)
      })
    }
    return { placed: out, byId: map }
  }, [data])

  const subjectId = data?.nodes.find(n => n.type === 'company')?.id

  // Which node ids are highlighted given the current hover.
  const activeIds = useMemo(() => {
    if (!hovered || !data) return null
    const set = new Set<string>([hovered])
    for (const e of data.edges) {
      if (e.from === hovered) set.add(e.to)
      if (e.to === hovered) set.add(e.from)
    }
    return set
  }, [hovered, data])

  function onNodeClick(n: GraphNode) {
    if (n.type === 'company') return // already centered
    if (n.type === 'peer') {
      const sym = (n.meta?.symbol || n.label || '').toUpperCase()
      if (sym) router.push(`${BASE}/app/company/${sym}?tab=relationships`)
      return
    }
    setDrawer(n)
  }

  // ── States ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
          Relationship map
        </div>
        <div style={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="skeleton" style={{ width: 360, height: 360, borderRadius: '50%' }} />
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <EmptyState icon="⚠" title="Couldn't load the relationship map" hint={error} />
      </div>
    )
  }

  const peripheral = placed.filter(p => p.type !== 'company')
  if (!peripheral.length) {
    return (
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <EmptyState
          icon="◎"
          title={`No relationship data for ${SYM}`}
          hint="Peers, ownership, segments and executive data weren't available for this company."
        />
      </div>
    )
  }

  const presentTypes = Array.from(new Set(peripheral.map(p => p.type)))

  return (
    <div className="fade-up" style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header + legend */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Relationship map · {SYM}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {(['peer', 'holder', 'segment', 'exec'] as NodeType[]).filter(t => presentTypes.includes(t)).map(t => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: TYPE_META[t].color }} />
                {TYPE_META[t].label}
              </span>
            ))}
          </div>
        </div>

        {/* Graph */}
        <div style={{ width: '100%', background: 'var(--bg)' }}>
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            width="100%"
            style={{ display: 'block', height: 'clamp(420px, 56vh, 640px)' }}
            role="img"
            aria-label={`Relationship map for ${SYM}`}
          >
            {/* Edges */}
            {data?.edges.map((e, i) => {
              const a = byId.get(e.from)
              const b = byId.get(e.to)
              if (!a || !b) return null
              const color = TYPE_META[EDGE_TYPE_NODE[e.type]].color
              const dim = activeIds ? (activeIds.has(e.from) && activeIds.has(e.to)) : true
              return (
                <line
                  key={`e${i}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={color}
                  strokeWidth={activeIds && dim ? 2.4 : 1.4}
                  strokeOpacity={dim ? (activeIds ? 0.9 : 0.35) : 0.08}
                  style={{ transition: 'stroke-opacity .15s, stroke-width .15s' }}
                />
              )
            })}

            {/* Nodes */}
            {placed.map((n) => {
              const meta = TYPE_META[n.type]
              const isSubject = n.type === 'company'
              const faded = activeIds ? !activeIds.has(n.id) : false
              const clickable = !isSubject
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onNodeClick(n)}
                  style={{ cursor: clickable ? 'pointer' : 'default', transition: 'opacity .15s', opacity: faded ? 0.35 : 1 }}
                >
                  {isSubject ? (
                    <>
                      <circle r={n.r} fill={meta.color} stroke="var(--bg-card)" strokeWidth={4} />
                      <text textAnchor="middle" dy={-2} fontSize={17} fontWeight={900} fill="#fff">{n.label}</text>
                      <text textAnchor="middle" dy={n.r + 18} fontSize={12} fontWeight={700} fill="var(--text-primary)">
                        {truncate(n.sublabel || '', 28)}
                      </text>
                    </>
                  ) : (
                    <>
                      <circle
                        r={n.r}
                        fill="var(--bg-card)"
                        stroke={meta.color}
                        strokeWidth={hovered === n.id ? 3 : 2}
                      />
                      <text textAnchor="middle" dy={4} fontSize={12} fontWeight={800} fill={meta.color}>
                        {n.type === 'peer' ? n.label : initials(n.label)}
                      </text>
                      {/* Outside label */}
                      <text
                        textAnchor="middle"
                        dy={n.r + 14}
                        fontSize={11}
                        fontWeight={700}
                        fill="var(--text-primary)"
                      >
                        {truncate(n.type === 'peer' ? (n.meta?.symbol || n.label) : n.label, 18)}
                      </text>
                      {n.sublabel && (
                        <text textAnchor="middle" dy={n.r + 28} fontSize={9.5} fontWeight={600} fill="var(--text-muted)">
                          {truncate(n.sublabel, 22)}
                        </text>
                      )}
                    </>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
          Click a peer to recenter the map · click a holder, segment or executive for sourced detail · hover to trace connections.
        </div>
      </div>

      {/* Detail drawer */}
      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={drawer?.label}>
        {drawer && <NodeDetail node={drawer} subjectName={data?.name || SYM} />}
      </Drawer>
    </div>
  )
}

function NodeDetail({ node, subjectName }: { node: GraphNode; subjectName: string }) {
  const meta = node.meta || {}
  const rows: Array<[string, string]> = []
  if (node.type === 'holder') {
    rows.push(['Relationship', `Institutional holder of ${subjectName}`])
    rows.push(['Shares', fmtShares(meta.shares)])
    rows.push(['Position value', fmtUsd(meta.value)])
    if (meta.change != null) rows.push(['Δ Shares', `${Number(meta.change) > 0 ? '+' : ''}${fmtShares(Math.abs(Number(meta.change)))}`])
    if (meta.changePct != null) rows.push(['Δ %', `${Number(meta.changePct) > 0 ? '+' : ''}${Number(meta.changePct).toFixed(2)}%`])
    if (meta.dateReported) rows.push(['As of', String(meta.dateReported)])
  } else if (node.type === 'segment') {
    rows.push(['Relationship', `Reported business segment of ${subjectName}`])
    rows.push(['Latest revenue', meta.value != null ? fmtUsd(meta.value) : '—'])
    if (meta.currency) rows.push(['Currency', String(meta.currency)])
  } else if (node.type === 'exec') {
    rows.push(['Relationship', `Key executive at ${subjectName}`])
    if (meta.title) rows.push(['Title', String(meta.title)])
    if (meta.pay != null) rows.push(['Reported comp', fmtUsd(meta.pay)])
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: TYPE_META[node.type].color }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{TYPE_META[node.type].label}</span>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, paddingBottom: 8, borderBottom: '1px dashed var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>{k}</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{v}</span>
          </div>
        ))}
      </div>
      {node.source && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Source</span>
          <Badge tone="blue">{sourceLabel(node.source)}</Badge>
        </div>
      )}
    </div>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────
function truncate(s: string, n: number) { return s && s.length > n ? s.slice(0, n - 1) + '…' : s }
function initials(s: string) {
  const parts = String(s || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
function sourceLabel(src: string) {
  const map: Record<string, string> = {
    fmp: 'Financial Modeling Prep',
    'fiscal.ai': 'Fiscal.ai',
    peer_set: 'Workspace peer set',
    suggested: 'Suggested peers',
    finnhub: 'Finnhub',
    yahoo: 'Yahoo Finance',
    eodhd: 'EODHD',
    massive: 'Massive',
    alphav: 'Alpha Vantage',
    none: 'Not available',
  }
  return map[src] || src
}

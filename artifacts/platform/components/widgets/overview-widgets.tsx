'use client'
/* ──────────────────────────────────────────────────────────────────────────
   Live Overview widgets.

   Every widget here pulls REAL data from existing platform endpoints
   (/api/quote, /api/aggs, /api/news, /api/earnings-calendar,
   /api/market-trends, /api/macro, /api/portfolio) and surfaces a `source`
   attribution footer where the provider is known. No fixtures, no stubs.

   The default Overview board reproduces today's Overview page exactly, so the
   first five "AI & Agents"/"Markets"/"Watchlist" widgets render their own
   cards/sections (chromeless) to match the original markup pixel-for-pixel.
   ────────────────────────────────────────────────────────────────────────── */
import { useState, useEffect, useCallback, useMemo, useId } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import LiveNowStrip from '@/components/LiveNowStrip'
import ActivityFeed from '@/components/ActivityFeed'
import WhatChangedBlock from '@/components/WhatChangedBlock'
import { ConnectSourcesOverviewCard } from '@/components/research-pack'
import {
  MetricTile, LoadingTile, ContextualAskBar, EmptyState, Badge,
  NAV_ICONS, ACTION_ICONS, ICON_STROKE,
} from '@/components/ui'
import { useWatchlist } from '@/lib/use-watchlist'
import { useAgents, scheduleSummary, relTime, statusTone } from '@/lib/agents'

/* ── Shared types ───────────────────────────────────────────────────────── */
type Quote = { symbol: string; price: number; change: number; changePct: number; spark?: number[]; name?: string }
type RawQuote = {
  symbol?: string; name?: string; companyName?: string
  price?: number; c?: number; change?: number; d?: number
  changePct?: number; dp?: number; spark?: number[]; source?: string
}
type NewsItem = { id: string; title: string; source: string; url: string; publishedAt: string; sentiment?: string | null; tickers?: string[] }

const INDEX_TICKERS = [
  { label: 'S&P 500',      ticker: 'SPY' },
  { label: 'NASDAQ 100',   ticker: 'QQQ' },
  { label: 'Dow Jones',    ticker: 'DIA' },
  { label: 'Russell 2000', ticker: 'IWM' },
  { label: '10Y Treasury', ticker: 'TLT' },
  { label: 'Gold',         ticker: 'GLD' },
] as const

/* ── Helpers ────────────────────────────────────────────────────────────── */
function fmtPrice(n: number) {
  if (n == null || Number.isNaN(n)) return '—'
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return n.toFixed(2)
}
function fmtPct(n: number) {
  if (n == null || Number.isNaN(n)) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

const SOURCE_LABELS: Record<string, string> = {
  fmp: 'Financial Modeling Prep',
  finnhub: 'Finnhub',
  fred: 'FRED',
  eodhd: 'EODHD',
  openwebninja: 'OpenWebNinja',
  massive: 'Massive',
  yahoo: 'Yahoo Finance',
  synthetic: 'synthetic',
  none: 'no source',
}
function sourceLabel(s?: string | null) {
  if (!s) return null
  return SOURCE_LABELS[s] ?? s
}

/** Small provider-attribution footer shown on every live-data widget. */
function SourceTag({ source }: { source?: string | null }) {
  const label = sourceLabel(source)
  if (!label) return null
  return (
    <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.02em', paddingTop: 8 }}>
      source: {label}
    </div>
  )
}

function MiniSpark({ data, pos }: { data: number[]; pos: boolean }) {
  const reactId = useId()
  if (!data?.length) return <div style={{ width: '100%', height: 28 }} />
  const series = data.map((v, i) => ({ v, i }))
  const id = `spark-${pos ? 'p' : 'n'}-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <ResponsiveContainer width="100%" height={28}>
      <AreaChart data={series}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={pos ? 'var(--pos)' : 'var(--neg)'} stopOpacity={0.32} />
            <stop offset="95%" stopColor={pos ? 'var(--pos)' : 'var(--neg)'} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={pos ? 'var(--pos)' : 'var(--neg)'} strokeWidth={1.5} fill={`url(#${id})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18,
}

/* ════════════════════════════════════════════════════════════════════════
   AI & AGENTS
   ════════════════════════════════════════════════════════════════════════ */

/** Page-aware ask bar grounded in the user's live watchlist. */
export function AiQuickAskWidget() {
  const { symbols } = useWatchlist({ pollMs: 60_000 })
  return (
    <ContextualAskBar
      context="Workspace overview"
      contextData={{ page: 'overview', watchlist: symbols }}
      chips={[
        { label: 'Overnight moves',   prompt: "What's moved overnight across my watchlist? Highlight anything outside one standard deviation." },
        { label: 'Fresh filings',     prompt: 'Summarise the freshest filings in my coverage and surface the most material disclosures.' },
        { label: 'Earnings to watch', prompt: 'Which earnings prints in the next 7 days deserve a deeper look on my watchlist?' },
        { label: 'Plan my morning',   prompt: 'Build me a research plan for today across my coverage — prioritise newsflow + open questions.' },
      ]}
      placeholder="Ask Finsyt about your morning brief…"
    />
  )
}

export function WhatChangedWidget() {
  return <WhatChangedBlock />
}

export function ConnectSourcesWidget() {
  return <ConnectSourcesOverviewCard onOpen={() => { window.location.href = '/app/settings?section=data' }} />
}

export function ActivityFeedWidget() {
  return <ActivityFeed limit={6} />
}

export function LiveNowWidget() {
  return <LiveNowStrip />
}

/** Workflow agents strip — sourced from the shared AgentsProvider. */
export function AgentsFeedWidget() {
  const { agents, runs } = useAgents()
  const visible = agents.slice(0, 4)
  const latestUnread = runs.find(r => !r.read)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Workflow Agents</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Pre-built and custom agents monitoring your universe</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/app/agents/library" style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)' }}>Browse template library</Link>
          <Link href="/app/agents" style={{ fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 700, padding: '6px 12px' }}>My agents →</Link>
        </div>
      </div>

      {latestUnread && (
        <Link href={`/app/agents/${latestUnread.agentId}/runs/${latestUnread.id}`} style={{ display: 'block', textDecoration: 'none', marginBottom: 12, background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--accent)', color: '#fff', letterSpacing: '0.04em' }}>NEW BRIEF</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-text)' }}>{latestUnread.agentName}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {relTime(latestUnread.ranAt)}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent-text)', fontWeight: 700 }}>Open brief →</span>
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.45 }}>{latestUnread.headline}</div>
        </Link>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map(ag => {
          const tone = statusTone(ag.status)
          const dot = tone === 'green' ? 'var(--pos)' : tone === 'blue' ? 'var(--accent-text)' : tone === 'amber' ? 'var(--amber)' : 'var(--text-muted)'
          return (
            <Link key={ag.id} href={`/app/agents/${ag.id}`} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start', textDecoration: 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--accent-dim)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <NAV_ICONS.agents width={16} height={16} strokeWidth={ICON_STROKE} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{ag.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: dot, boxShadow: ag.status === 'Running' ? `0 0 6px ${dot}` : 'none' }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: dot }}>{ag.status}</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.4 }}>{scheduleSummary(ag.schedule)}</div>
                <div style={{ display: 'flex', gap: 14 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last: <span style={{ color: 'var(--text-secondary)' }}>{relTime(ag.lastRunAt)}</span></span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Next: <span style={{ color: ag.status === 'Paused' ? 'var(--amber)' : 'var(--text-secondary)' }}>{ag.status === 'Paused' ? 'Paused' : relTime(ag.nextRunAt)}</span></span>
                </div>
              </div>
              <span style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 }}>View →</span>
            </Link>
          )
        })}
        <Link href="/app/agents/new" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', borderRadius: 12, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--accent-text)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
          <ACTION_ICONS.plus width={14} height={14} strokeWidth={ICON_STROKE} />
          Create new agent
        </Link>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   MARKETS
   ════════════════════════════════════════════════════════════════════════ */

/** Live index strip — six MetricTiles sourced from /api/quote. */
export function IndicesWidget() {
  const router = useRouter()
  const [indices, setIndices] = useState<(Quote & { label: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/quote?symbols=' + INDEX_TICKERS.map(t => t.ticker).join(','))
      const data = (await res.json()) as { quotes?: RawQuote[] }
      const map = new Map<string, RawQuote>((data.quotes ?? []).map(q => [String(q.symbol ?? ''), q]))
      setSource((data.quotes ?? []).find(q => q.source)?.source ?? null)
      setIndices(INDEX_TICKERS.map(t => {
        const q: RawQuote = map.get(t.ticker) ?? {}
        return {
          symbol: t.ticker, label: t.label,
          price: Number(q.price ?? q.c ?? 0),
          change: Number(q.change ?? q.d ?? 0),
          changePct: Number(q.changePct ?? q.dp ?? 0),
          spark: Array.isArray(q.spark) ? q.spark : [],
        }
      }))
    } catch { setIndices([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(); const id = setInterval(load, 60_000); return () => clearInterval(id) }, [load])

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {loading
          ? <LoadingTile count={6} />
          : indices.map(idx => (
              <MetricTile
                key={idx.symbol}
                label={idx.label}
                value={fmtPrice(idx.price)}
                change={fmtPct(idx.changePct)}
                changeTone={idx.changePct >= 0 ? 'pos' : 'neg'}
                hint={idx.symbol}
                footer={idx.spark && idx.spark.length
                  ? <span style={{ display: 'inline-block', width: 64 }}><MiniSpark data={idx.spark} pos={idx.changePct >= 0} /></span>
                  : undefined}
                onClick={() => router.push('/app/markets')}
              />
            ))
        }
      </div>
      {!loading && <SourceTag source={source} />}
    </div>
  )
}

type MoverRow = { symbol: string; name?: string; price?: number; change?: number; changePct?: number }

/** Market movers — most active / gainers / losers from /api/market-trends. */
export function MarketMoversWidget() {
  const [tab, setTab] = useState<'MOST_ACTIVE' | 'GAINERS' | 'LOSERS'>('MOST_ACTIVE')
  const [rows, setRows] = useState<MoverRow[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/market-trends?type=${tab}&country=US`)
      .then(r => r.json())
      .then((data: { trends?: MoverRow[]; source?: string }) => {
        if (!alive) return
        setRows((data.trends ?? []).slice(0, 6))
        setSource(data.source ?? null)
      })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [tab])

  return (
    <div style={{ padding: '10px 14px' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 10, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {(['MOST_ACTIVE', 'GAINERS', 'LOSERS'] as const).map(k => (
          <button key={k} onClick={() => setTab(k)} style={{ fontSize: 11, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: tab === k ? 'var(--text-primary)' : 'var(--text-secondary)', borderBottom: `2px solid ${tab === k ? 'var(--accent)' : 'transparent'}`, padding: '0 0 4px', whiteSpace: 'nowrap' }}>
            {k === 'MOST_ACTIVE' ? 'Most Active' : k === 'GAINERS' ? 'Top Gainers' : 'Top Losers'}
          </button>
        ))}
      </div>
      {loading ? <LoadingTile count={4} /> : rows.length === 0 ? (
        <EmptyState title="No movers" hint="Trend providers returned nothing for this filter right now." />
      ) : rows.map((m, i) => {
        const pct = Number(m.changePct ?? 0)
        const pos = pct >= 0
        return (
          <Link key={(m.symbol ?? '') + i} href={`/app/company/${m.symbol}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)', fontWeight: 800, fontSize: 10, flexShrink: 0 }}>{(m.symbol ?? '?')[0]}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}>{m.symbol}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{m.name ?? ''}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {m.price != null && <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>${fmtPrice(Number(m.price))}</div>}
              <div style={{ fontSize: 11, fontWeight: 700, color: pos ? 'var(--pos)' : 'var(--neg)' }}>{pos ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%</div>
            </div>
          </Link>
        )
      })}
      {!loading && <SourceTag source={source} />}
    </div>
  )
}

type MacroSnap = Record<string, { indicator: string; latest?: { date?: string; value?: number } | null } | null>
const MACRO_FIELDS: { key: string; label: string; suffix?: string }[] = [
  { key: 'federalFunds',          label: 'Fed Funds',     suffix: '%' },
  { key: 'CPI',                   label: 'CPI' },
  { key: 'realGDP',              label: 'Real GDP' },
  { key: 'unemploymentRate',     label: 'Unemployment',  suffix: '%' },
  { key: 'us10YearTreasuryRate', label: '10Y Treasury',  suffix: '%' },
  { key: 'consumerSentiment',    label: 'Consumer Sent.' },
]

/** Macro snapshot — Fed funds, CPI, GDP, unemployment & yields from /api/macro. */
export function MacroSnapshotWidget() {
  const [snap, setSnap] = useState<MacroSnap>({})
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/macro?all=true')
      .then(r => r.json())
      .then((data: { snapshot?: MacroSnap; source?: string }) => {
        if (!alive) return
        setSnap(data.snapshot ?? {})
        setSource(data.source ?? null)
      })
      .catch(() => { if (alive) setSnap({}) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const fields = MACRO_FIELDS.map(f => {
    const v = snap[f.key]?.latest?.value
    return { ...f, value: typeof v === 'number' ? v : null }
  }).filter(f => f.value != null)

  return (
    <div style={{ padding: '10px 14px' }}>
      {loading ? <LoadingTile count={4} /> : fields.length === 0 ? (
        <EmptyState title="No macro data" hint="Connect FMP to populate the macro snapshot." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {fields.map(f => (
            <div key={f.key} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px' }}>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{f.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 3 }}>
                {Number(f.value).toLocaleString('en-US', { maximumFractionDigits: 2 })}{f.suffix ?? ''}
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && <SourceTag source={source} />}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   WATCHLIST
   ════════════════════════════════════════════════════════════════════════ */

// Shared watchlist→quote loader with spark backfill from /api/aggs.
function useCoverage(max: number) {
  const { symbols, loading: wlLoading } = useWatchlist({ pollMs: 60_000 })
  const [coverage, setCoverage] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<string | null>(null)

  const load = useCallback(async (syms: string[]) => {
    try {
      const top = syms.slice(0, max)
      if (!top.length) { setCoverage([]); return }
      const qRes = await fetch('/api/quote?symbols=' + top.join(','))
      const qData = (await qRes.json()) as { quotes?: RawQuote[] }
      setSource((qData.quotes ?? []).find(q => q.source)?.source ?? null)
      const quotes: Quote[] = (qData.quotes ?? []).map(q => ({
        symbol: String(q.symbol ?? ''), name: String(q.name ?? q.companyName ?? ''),
        price: Number(q.price ?? q.c ?? 0), change: Number(q.change ?? q.d ?? 0),
        changePct: Number(q.changePct ?? q.dp ?? 0), spark: Array.isArray(q.spark) ? q.spark : [],
      }))
      const ordered = top.map(s => quotes.find(q => q.symbol === s)).filter((q): q is Quote => !!q)
      const enriched = await Promise.all(ordered.map(async q => {
        if (q.spark && q.spark.length > 1) return q
        try {
          const to = new Date().toISOString().slice(0, 10)
          const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
          const r = await fetch(`/api/aggs?symbol=${q.symbol}&from=${from}&to=${to}`)
          const d = (await r.json()) as { bars?: Array<{ c?: number }> }
          const closes = (d.bars || []).map(b => Number(b.c ?? 0)).filter(n => n > 0)
          return closes.length > 1 ? { ...q, spark: closes } : q
        } catch { return q }
      }))
      setCoverage(enriched)
    } catch { setCoverage([]) } finally { setLoading(false) }
  }, [max])

  useEffect(() => { if (!wlLoading) void load(symbols) }, [load, symbols, wlLoading])

  return { coverage, loading: loading || wlLoading, source }
}

function CoverageCard({ q }: { q: Quote }) {
  const pos = q.changePct >= 0
  return (
    <Link href={`/app/company/${q.symbol}`} style={{ display: 'block', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--accent-text)', flexShrink: 0 }}>{q.symbol.slice(0, 2)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{q.symbol}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.name || '—'}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>${fmtPrice(q.price)}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: pos ? 'var(--pos)' : 'var(--neg)' }}>{fmtPct(q.changePct)}</div>
        </div>
      </div>
      {q.spark && q.spark.length > 0 && <div style={{ height: 28 }}><MiniSpark data={q.spark} pos={pos} /></div>}
    </Link>
  )
}

function EmptyCoverage() {
  const Icon = NAV_ICONS.watchlist
  return (
    <div style={{ borderRadius: 12, border: '1px dashed var(--border)', background: 'var(--bg-card)' }}>
      <EmptyState
        icon={<Icon width={22} height={22} strokeWidth={ICON_STROKE} color="var(--accent-text)" />}
        title="Your watchlist is empty"
        hint="Add tickers and Finsyt will surface filings, prices, and agent runs across them here."
        action={<Link href="/app/watchlist" style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Add tickers →</Link>}
      />
    </div>
  )
}

/** Intelligence coverage — live price + spark cards across the watchlist. */
export function WatchlistCoverageWidget() {
  const { coverage, loading, source } = useCoverage(9)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Intelligence Coverage</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {loading ? 'Loading your watchlist…' : `Live monitoring across ${coverage.length} compan${coverage.length === 1 ? 'y' : 'ies'}`}
          </div>
        </div>
        <Link href="/app/watchlist" style={{ fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>Manage coverage →</Link>
      </div>
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}><LoadingTile count={6} /></div>
      ) : coverage.length === 0 ? <EmptyCoverage /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {coverage.map(co => <CoverageCard key={co.symbol} q={co} />)}
        </div>
      )}
      {!loading && coverage.length > 0 && <SourceTag source={source} />}
    </div>
  )
}

/** Compact watchlist rail. */
export function WatchlistRailWidget() {
  const { coverage, loading, source } = useCoverage(6)
  const rows = coverage.slice(0, 6)
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Watchlist snapshot</span>
        <Link href="/app/watchlist" style={{ fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>All →</Link>
      </div>
      {loading ? (
        <div style={{ padding: '12px 16px' }}><LoadingTile /></div>
      ) : rows.length === 0 ? (
        <EmptyState title="No tickers yet" hint="Add a few names you follow and they'll show up here on every visit."
          action={<Link href="/app/watchlist" style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Add tickers →</Link>} />
      ) : rows.map((r, i) => {
        const pos = r.changePct >= 0
        return (
          <Link key={r.symbol} href={`/app/company/${r.symbol}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none' }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--accent-text)', flexShrink: 0 }}>{r.symbol.slice(0, 2)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{r.symbol}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || '—'}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: pos ? 'var(--pos)' : 'var(--neg)' }}>{fmtPct(r.changePct)}</div>
            <div style={{ width: 48 }}>{r.spark && r.spark.length > 0 && <MiniSpark data={r.spark} pos={pos} />}</div>
          </Link>
        )
      })}
      {!loading && rows.length > 0 && <div style={{ padding: '0 16px 10px' }}><SourceTag source={source} /></div>}
    </div>
  )
}

/** Real-time price ticker for the watchlist (compact, carded). */
export function PriceMonitorWidget() {
  const { coverage, loading, source } = useCoverage(12)
  return (
    <div style={{ padding: '4px 0' }}>
      {loading ? <div style={{ padding: '8px 14px' }}><LoadingTile count={5} /></div> : coverage.length === 0 ? (
        <div style={{ padding: '8px 14px' }}>
          <EmptyState title="No tickers yet" hint="Add names to your watchlist to monitor live prices."
            action={<Link href="/app/watchlist" style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Add tickers →</Link>} />
        </div>
      ) : (
        <>
          {coverage.map((q, i) => {
            const pos = q.changePct >= 0
            return (
              <Link key={q.symbol} href={`/app/company/${q.symbol}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: i < coverage.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{q.symbol}</span>
                <span style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>${fmtPrice(q.price)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: pos ? 'var(--pos)' : 'var(--neg)', width: 64, textAlign: 'right' }}>{fmtPct(q.changePct)}</span>
                </span>
              </Link>
            )
          })}
          <div style={{ padding: '0 14px' }}><SourceTag source={source} /></div>
        </>
      )}
    </div>
  )
}

type Position = { id: string; symbol: string; shares: number; costBasis: number }

/** Portfolio summary — synced positions valued with live /api/quote prices. */
export function PortfolioSummaryWidget() {
  const [positions, setPositions] = useState<Position[]>([])
  const [quotes, setQuotes] = useState<Record<string, RawQuote>>({})
  const [loading, setLoading] = useState(true)
  const [synced, setSynced] = useState(true)
  const [source, setSource] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/portfolio', { credentials: 'same-origin' })
        const data = (await res.json()) as { positions?: Position[]; synced?: boolean }
        if (!alive) return
        const pos = (data.positions ?? []).filter(p => p.symbol)
        setPositions(pos)
        setSynced(data.synced !== false)
        const syms = Array.from(new Set(pos.map(p => p.symbol)))
        if (syms.length) {
          const qRes = await fetch('/api/quote?symbols=' + syms.join(','))
          const qData = (await qRes.json()) as { quotes?: RawQuote[] }
          if (!alive) return
          setSource((qData.quotes ?? []).find(q => q.source)?.source ?? null)
          setQuotes(Object.fromEntries((qData.quotes ?? []).map(q => [String(q.symbol ?? ''), q])))
        }
      } catch { if (alive) setPositions([]) } finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [])

  const totals = useMemo(() => {
    let mv = 0, cost = 0, day = 0
    for (const p of positions) {
      const q = quotes[p.symbol]
      const price = Number(q?.price ?? q?.c ?? 0)
      const change = Number(q?.change ?? q?.d ?? 0)
      mv += price * p.shares
      cost += p.costBasis * p.shares
      day += change * p.shares
    }
    const totalPL = mv - cost
    return { mv, cost, day, totalPL, totalPLPct: cost > 0 ? (totalPL / cost) * 100 : 0 }
  }, [positions, quotes])

  return (
    <div style={{ padding: '12px 14px' }}>
      {loading ? <LoadingTile count={3} /> : !synced ? (
        <EmptyState title="No workspace" hint="Sign in to a workspace to track a portfolio." />
      ) : positions.length === 0 ? (
        <EmptyState title="No positions yet" hint="Import positions to see live market value and day P&L."
          action={<Link href="/app/portfolio" style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Add positions →</Link>} />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Market value</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>${totals.mv.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Day P&amp;L</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: totals.day >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{totals.day >= 0 ? '+' : ''}${Math.abs(totals.day).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Total P&amp;L</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: totals.totalPL >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{totals.totalPL >= 0 ? '+' : ''}${Math.abs(totals.totalPL).toLocaleString('en-US', { maximumFractionDigits: 0 })} ({fmtPct(totals.totalPLPct)})</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Positions</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{positions.length}</div>
            </div>
          </div>
          <Link href="/app/portfolio" style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-text)', textDecoration: 'none' }}>Open portfolio →</Link>
          <SourceTag source={source} />
        </>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   NEWS
   ════════════════════════════════════════════════════════════════════════ */

/** Latest headlines — live /api/news with sentiment tags. */
export function NewsFeedWidget() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/news?limit=8')
      .then(r => r.json())
      .then((data: { news?: NewsItem[]; articles?: NewsItem[]; source?: string }) => {
        if (!alive) return
        setNews((data.news || data.articles || []).slice(0, 6))
        setSource(data.source ?? null)
      })
      .catch(() => { if (alive) setNews([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Latest headlines</span>
        <Link href="/app/news" style={{ fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>All news →</Link>
      </div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><LoadingTile count={4} /></div>
      ) : news.length === 0 ? (
        <EmptyState title="No fresh headlines" hint="Finsyt will pull new stories the moment your providers publish them." />
      ) : news.map((n, i) => {
        const tone: 'pos' | 'neg' | 'neutral' = n.sentiment === 'positive' ? 'pos' : n.sentiment === 'negative' ? 'neg' : 'neutral'
        return (
          <a key={n.id || i} href={n.url || '#'} target={n.url ? '_blank' : undefined} rel="noreferrer" style={{ display: 'block', padding: '10px 0', borderBottom: i < news.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              <span>{n.source || '—'}</span>
              {n.publishedAt && <span>· {relTime(n.publishedAt)}</span>}
              {n.sentiment && tone !== 'neutral' && <Badge tone={tone === 'pos' ? 'green' : 'red'}>{n.sentiment}</Badge>}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.45 }}>{n.title}</div>
          </a>
        )
      })}
      {!loading && news.length > 0 && <SourceTag source={source} />}
    </div>
  )
}

type EarningsItem = { symbol: string; date: string; epsEstimate?: number | null; timing?: string }
type RawEarning = {
  symbol?: string; ticker?: string
  date?: string; reportDate?: string; earnings_date?: string
  epsEstimate?: number | null; estimate?: number | null; eps_est?: number | null
  timing?: string; time?: string; reportTime?: string
}

/** Earnings ahead — next 14 days across the user's coverage. */
export function EarningsAheadWidget() {
  const { symbols } = useWatchlist({ pollMs: 60_000 })
  const [items, setItems] = useState<EarningsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<string | null>(null)
  const symKey = symbols.join(',')

  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      try {
        const from = new Date().toISOString().slice(0, 10)
        const to = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
        const params = new URLSearchParams({ from, to })
        if (symKey) params.set('symbols', symKey)
        const res = await fetch('/api/earnings-calendar?' + params.toString())
        const data = (await res.json()) as { earnings?: RawEarning[]; calendar?: RawEarning[]; items?: RawEarning[]; source?: string }
        const raw: RawEarning[] = data.earnings ?? data.calendar ?? data.items ?? []
        const list: EarningsItem[] = raw.map((e): EarningsItem => ({
          symbol: String(e.symbol ?? e.ticker ?? '').toUpperCase(),
          date: String(e.date ?? e.reportDate ?? e.earnings_date ?? ''),
          epsEstimate: e.epsEstimate ?? e.estimate ?? e.eps_est ?? null,
          timing: String(e.timing ?? e.time ?? e.reportTime ?? ''),
        })).filter(e => e.symbol && e.date).slice(0, 5)
        if (alive) { setItems(list); setSource(data.source ?? null) }
      } catch { if (alive) setItems([]) } finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [symKey])

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Earnings ahead</span>
        <Link href="/app/calendar" style={{ fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>Calendar →</Link>
      </div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><LoadingTile count={3} /></div>
      ) : items.length === 0 ? (
        <EmptyState title="No upcoming earnings" hint="Nothing on your watchlist is reporting in the next two weeks." />
      ) : items.map((e, i) => (
        <Link key={e.symbol + e.date} href={`/app/company/${e.symbol}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none', textDecoration: 'none' }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--accent-text)', flexShrink: 0 }}>{e.symbol.slice(0, 2)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{e.symbol}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {new Date(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              {e.epsEstimate != null && ` · Est. EPS $${Number(e.epsEstimate).toFixed(2)}`}
            </div>
          </div>
          {e.timing && <Badge tone="blue">{e.timing}</Badge>}
        </Link>
      ))}
      {!loading && items.length > 0 && <SourceTag source={source} />}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   WORKSPACE
   ════════════════════════════════════════════════════════════════════════ */

/** Quick-access navigation grid (navigation only — no market data). */
export function QuickAccessWidget() {
  const links = [
    { href: '/app/research', icon: NAV_ICONS.research, label: 'AI Research',   desc: 'Ask anything' },
    { href: '/app/models',   icon: NAV_ICONS.models,   label: 'Model Builder', desc: 'DCF & LBO models' },
    { href: '/app/screener', icon: NAV_ICONS.screener, label: 'Screener',      desc: 'Filter 70K+ tickers' },
    { href: '/app/filings',  icon: NAV_ICONS.filings,  label: 'SEC Filings',   desc: '10-K, 10-Q, 8-K' },
    { href: '/app/markets',  icon: NAV_ICONS.markets,  label: 'Markets',       desc: 'Global indices & FX' },
    { href: '/app/macro',    icon: NAV_ICONS.macro,    label: 'Macro',         desc: 'FRED & indicators' },
  ]
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>Quick access</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {links.map(l => {
          const Icon = l.icon
          return (
            <Link key={l.href} href={l.href} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px', borderRadius: 10, border: '1px solid var(--border)', textDecoration: 'none', background: 'var(--bg-card)' }}>
              <Icon width={18} height={18} strokeWidth={ICON_STROKE} color="var(--accent-text)" />
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{l.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3 }}>{l.desc}</div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback, useMemo, useId } from 'react'
import Link from 'next/link'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import LiveNowStrip from '@/components/LiveNowStrip'
import ActivityFeed from '@/components/ActivityFeed'
import WhatChangedBlock from '@/components/WhatChangedBlock'
import { useUser } from '@clerk/nextjs'
import {
  PageHero, MetricTile, LoadingTile, ContextualAskBar, EmptyState,
  Badge, NAV_ICONS, ACTION_ICONS, ICON_STROKE,
} from '@/components/ui'
import { useRouter } from 'next/navigation'
import { useAgents, scheduleSummary, relTime, statusTone } from '@/lib/agents'
import { useWatchlist } from '@/lib/use-watchlist'
import { ConnectSourcesOverviewCard } from '@/components/research-pack'

/* ──────────────────────────────────────────────────────────────────────────
   Overview is now 100% data-driven. Every tile sources real values from the
   API: indices come from /api/quote, headlines from /api/news, coverage from
   /api/watchlist + /api/quote, sparklines from the quote payload (which
   providers populate inline). No deterministic stubs and no fixture lists
   are used to render this page.
   ──────────────────────────────────────────────────────────────────────── */

const INDEX_TICKERS = [
  { label: 'S&P 500',     ticker: 'SPY' },
  { label: 'NASDAQ 100',  ticker: 'QQQ' },
  { label: 'Dow Jones',   ticker: 'DIA' },
  { label: 'Russell 2000',ticker: 'IWM' },
  { label: '10Y Treasury',ticker: 'TLT' },
  { label: 'Gold',        ticker: 'GLD' },
] as const

type Quote = {
  symbol: string
  price: number
  change: number
  changePct: number
  spark?: number[]
  name?: string
}

type NewsItem = {
  id: string
  title: string
  source: string
  url: string
  publishedAt: string
  sentiment?: string | null
  tickers?: string[]
}

function fmtPrice(n: number) {
  if (n == null || Number.isNaN(n)) return '—'
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return n.toFixed(2)
}
function fmtPct(n: number) {
  if (n == null || Number.isNaN(n)) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
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

export default function OverviewPage() {
  const { user } = useUser()
  const router = useRouter()
  const greetingName =
    user?.firstName ||
    user?.username ||
    user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] ||
    'there'

  const [time, setTime] = useState<Date | null>(null)
  useEffect(() => {
    setTime(new Date())
    const id = setInterval(() => setTime(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // ── Indices ─────────────────────────────────────────────────────────────
  const [indices, setIndices]       = useState<(Quote & { label: string })[]>([])
  const [indicesLoading, setIdxL]   = useState(true)

  // ── Coverage (user watchlist) ────────────────────────────────────────────
  // Watchlist symbols flow through the shared `useWatchlist` hook so add/remove
  // actions from anywhere on the platform stay in sync with the morning brief.
  const { symbols: watchlistSymbols, loading: watchlistLoading } = useWatchlist({ pollMs: 60_000 })
  const [coverage, setCoverage]     = useState<Quote[]>([])
  const [coverageLoading, setCovL]  = useState(true)

  // ── News headlines ───────────────────────────────────────────────────────
  const [news, setNews]             = useState<NewsItem[]>([])
  const [newsLoading, setNewsL]     = useState(true)

  const loadIndices = useCallback(async () => {
    try {
      const res = await fetch('/api/quote?symbols=' + INDEX_TICKERS.map(t => t.ticker).join(','))
      const data = (await res.json()) as { quotes?: RawQuote[] }
      const map = new Map<string, RawQuote>(
        (data.quotes ?? []).map(q => [String(q.symbol ?? ''), q]),
      )
      setIndices(INDEX_TICKERS.map(t => {
        const q: RawQuote = map.get(t.ticker) ?? {}
        return {
          symbol: t.ticker,
          label: t.label,
          price: Number(q.price ?? q.c ?? 0),
          change: Number(q.change ?? q.d ?? 0),
          changePct: Number(q.changePct ?? q.dp ?? 0),
          spark: Array.isArray(q.spark) ? q.spark : [],
        }
      }))
    } catch {
      setIndices([])
    } finally {
      setIdxL(false)
    }
  }, [])

  const loadCoverage = useCallback(async (symbols: string[]) => {
    try {
      const top = symbols.slice(0, 9)
      if (!top.length) { setCoverage([]); return }
      const qRes = await fetch('/api/quote?symbols=' + top.join(','))
      const qData = (await qRes.json()) as { quotes?: RawQuote[] }
      const quotes: Quote[] = (qData.quotes ?? []).map(q => ({
        symbol: String(q.symbol ?? ''),
        name:   String(q.name ?? q.companyName ?? ''),
        price:  Number(q.price ?? q.c ?? 0),
        change: Number(q.change ?? q.d ?? 0),
        changePct: Number(q.changePct ?? q.dp ?? 0),
        spark:  Array.isArray(q.spark) ? q.spark : [],
      }))
      const ordered = top
        .map(s => quotes.find(q => q.symbol === s))
        .filter((q): q is Quote => !!q)
      // Backfill missing sparklines from /api/aggs (30-day daily closes) so the
      // tile chart never shows a flat baseline when the quote provider didn't
      // bundle spark data inline.
      const enriched = await Promise.all(ordered.map(async q => {
        if (q.spark && q.spark.length > 1) return q
        try {
          const to   = new Date().toISOString().slice(0, 10)
          const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
          const r    = await fetch(`/api/aggs?symbol=${q.symbol}&from=${from}&to=${to}`)
          const d    = (await r.json()) as { bars?: Array<{ c?: number }> }
          const closes = (d.bars || []).map(b => Number(b.c ?? 0)).filter(n => n > 0)
          return closes.length > 1 ? { ...q, spark: closes } : q
        } catch { return q }
      }))
      setCoverage(enriched)
    } catch {
      setCoverage([])
    } finally {
      setCovL(false)
    }
  }, [])

  const loadNews = useCallback(async () => {
    try {
      const res = await fetch('/api/news?limit=8')
      const data = await res.json()
      setNews((data.news || data.articles || []).slice(0, 6))
    } catch {
      setNews([])
    } finally {
      setNewsL(false)
    }
  }, [])

  useEffect(() => {
    loadIndices(); loadNews()
  }, [loadIndices, loadNews])

  // Reload coverage whenever the shared watchlist hook hands us a fresh symbol
  // set — covers both initial hydration and add/remove from anywhere on the
  // platform without needing a page reload.
  useEffect(() => {
    if (watchlistLoading) return
    void loadCoverage(watchlistSymbols)
  }, [loadCoverage, watchlistSymbols, watchlistLoading])

  useEffect(() => {
    const id = setInterval(() => { loadIndices() }, 60_000)
    return () => clearInterval(id)
  }, [loadIndices])

  const monitoringCount = coverage.length
  const subtitle = useMemo(() => {
    if (coverageLoading || watchlistLoading) return 'Bringing your morning into focus…'
    if (!monitoringCount) return 'Add tickers to your watchlist to start the morning brief — Finsyt will track filings, news, and price action across them.'
    return `Finsyt is monitoring ${monitoringCount} compan${monitoringCount === 1 ? 'y' : 'ies'} on your watchlist. Pick up where you left off — or ask the agent something new.`
  }, [coverageLoading, watchlistLoading, monitoringCount])

  return (
    <div>
      {/* Hero */}
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <PageHero
          eyebrow={time ? time.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '\u00A0'}
          title={`Your morning, market-ready, ${greetingName}.`}
          accentWord="market-ready"
          subtitle={subtitle}
          actions={
            <>
              <Link
                href="/app/models"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px',
                  borderRadius: 10, background: 'transparent', border: '1.5px solid var(--border)',
                  color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, textDecoration: 'none',
                }}
              >
                <NAV_ICONS.models width={14} height={14} strokeWidth={ICON_STROKE} />
                Model Builder
              </Link>
              <Link
                href="/app/research"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px',
                  borderRadius: 10, background: 'var(--gradient-brand)', border: 'none',
                  color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
                  boxShadow: '0 4px 14px var(--accent-dim)',
                }}
              >
                Open AI Research
                <ACTION_ICONS.arrowRight width={14} height={14} strokeWidth={ICON_STROKE} />
              </Link>
            </>
          }
        />
      </div>

      <div style={{ padding: '0 1.75rem 1.75rem', maxWidth: 1400, margin: '0 auto' }}>

        {/* Inline ask bar — page-aware prompts that route to the global agent */}
        <ContextualAskBar
          context="Workspace overview"
          contextData={{ page: 'overview', watchlist: coverage.map(c => c.symbol) }}
          chips={[
            { label: 'Overnight moves',  prompt: "What's moved overnight across my watchlist? Highlight anything outside one standard deviation." },
            { label: 'Fresh filings',    prompt: 'Summarise the freshest filings in my coverage and surface the most material disclosures.' },
            { label: 'Earnings to watch',prompt: 'Which earnings prints in the next 7 days deserve a deeper look on my watchlist?' },
            { label: 'Plan my morning',  prompt: 'Build me a research plan for today across my coverage — prioritise newsflow + open questions.' },
          ]}
          placeholder="Ask Finsyt about your morning brief…"
          style={{ margin: '14px 0 18px' }}
        />

        {/* What changed since you last visited */}
        <div style={{ marginBottom: 18 }}>
          <WhatChangedBlock />
        </div>

        <div style={{ marginBottom: 18 }}>
          <ConnectSourcesOverviewCard onOpen={() => { window.location.href = '/app/settings?section=data' }} />
        </div>

        {/* Live + activity */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14, marginBottom: 18 }}>
          <LiveNowStrip />
          <ActivityFeed limit={4} />
        </div>

        {/* Live indices — sourced from /api/quote */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 24 }}>
          {indicesLoading
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

        {/* Coverage — driven by /api/watchlist */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Intelligence Coverage</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                {coverageLoading
                  ? 'Loading your watchlist…'
                  : `Live monitoring across ${monitoringCount} compan${monitoringCount === 1 ? 'y' : 'ies'}`}
              </div>
            </div>
            <Link href="/app/watchlist" style={{ fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>
              Manage coverage →
            </Link>
          </div>
          {coverageLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <LoadingTile count={6} />
            </div>
          ) : coverage.length === 0 ? (
            <EmptyCoverage />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {coverage.map(co => (
                <CoverageCard key={co.symbol} q={co} />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, marginBottom: 24 }}>
          {/* Workflow Agents — sourced from AgentsProvider */}
          <AgentsStrip />

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <RecentWatchlistRail loading={coverageLoading} coverage={coverage.slice(0, 4)} />
          </div>
        </div>

        {/* News + Earnings + Sources */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 24 }}>
          <NewsCard loading={newsLoading} news={news} />
          <UpcomingEarningsCard symbols={coverage.map(c => c.symbol)} />
        </div>

        {/* Quick access */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>Quick access</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
            {[
              { href: '/app/research', icon: NAV_ICONS.research, label: 'AI Research',   desc: 'Ask anything' },
              { href: '/app/models',   icon: NAV_ICONS.models,   label: 'Model Builder', desc: 'DCF & LBO models' },
              { href: '/app/screener', icon: NAV_ICONS.screener, label: 'Screener',      desc: 'Filter 70K+ tickers' },
              { href: '/app/filings',  icon: NAV_ICONS.filings,  label: 'SEC Filings',   desc: '10-K, 10-Q, 8-K' },
              { href: '/app/markets',  icon: NAV_ICONS.markets,  label: 'Markets',       desc: 'Global indices & FX' },
              { href: '/app/macro',    icon: NAV_ICONS.macro,    label: 'Macro',         desc: 'FRED & indicators' },
            ].map(l => {
              const Icon = l.icon
              return (
                <Link key={l.href} href={l.href} style={{
                  display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 14px', borderRadius: 10,
                  border: '1px solid var(--border)', textDecoration: 'none', background: 'var(--bg-card)',
                  transition: 'all 0.14s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'var(--accent-dim)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)' }}>
                  <Icon width={18} height={18} strokeWidth={ICON_STROKE} color="var(--accent-text)" />
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{l.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3 }}>{l.desc}</div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Coverage card ───────────────────────────────────────────────────────── */
function CoverageCard({ q }: { q: Quote }) {
  const pos = q.changePct >= 0
  return (
    <Link href={`/app/company/${q.symbol}`} style={{
      display: 'block', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '14px 16px', textDecoration: 'none', transition: 'border-color 0.15s, background 0.15s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, background: 'var(--accent-dim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, color: 'var(--accent-text)', flexShrink: 0,
        }}>{q.symbol.slice(0, 2)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{q.symbol}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {q.name || '—'}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>${fmtPrice(q.price)}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: pos ? 'var(--pos)' : 'var(--neg)' }}>{fmtPct(q.changePct)}</div>
        </div>
      </div>
      {q.spark && q.spark.length > 0 && (
        <div style={{ height: 28 }}><MiniSpark data={q.spark} pos={pos} /></div>
      )}
    </Link>
  )
}

function EmptyCoverage() {
  const Icon = NAV_ICONS.watchlist
  return (
    <div style={{
      borderRadius: 12, border: '1px dashed var(--border)', background: 'var(--bg-card)',
    }}>
      <EmptyState
        icon={<Icon width={22} height={22} strokeWidth={ICON_STROKE} color="var(--accent-text)" />}
        title="Your watchlist is empty"
        hint="Add tickers and Finsyt will surface filings, prices, and agent runs across them here."
        action={
          <Link href="/app/watchlist" style={{
            display: 'inline-block', padding: '8px 14px', borderRadius: 8, background: 'var(--accent)',
            color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none',
          }}>Add tickers →</Link>
        }
      />
    </div>
  )
}

/* ── Recent watchlist rail (right column) ────────────────────────────────── */
function RecentWatchlistRail({ loading, coverage }: { loading: boolean; coverage: Quote[] }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Watchlist snapshot</span>
        <Link href="/app/watchlist" style={{ fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>All →</Link>
      </div>
      {loading ? (
        <div style={{ padding: '12px 16px' }}>
          <LoadingTile />
        </div>
      ) : coverage.length === 0 ? (
        <EmptyState
          title="No tickers yet"
          hint="Add a few names you follow and they'll show up here on every visit."
          action={
            <Link href="/app/watchlist" style={{
              display: 'inline-block', padding: '6px 12px', borderRadius: 8, background: 'var(--accent)',
              color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none',
            }}>Add tickers →</Link>
          }
        />
      ) : coverage.map((r, i) => {
        const pos = r.changePct >= 0
        return (
          <Link key={r.symbol} href={`/app/company/${r.symbol}`} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
            borderBottom: i < coverage.length - 1 ? '1px solid var(--border)' : 'none',
            textDecoration: 'none', transition: 'background 0.12s',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            <div style={{
              width: 30, height: 30, borderRadius: 7, background: 'var(--accent-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, color: 'var(--accent-text)', flexShrink: 0,
            }}>{r.symbol.slice(0, 2)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{r.symbol}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || '—'}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: pos ? 'var(--pos)' : 'var(--neg)' }}>{fmtPct(r.changePct)}</div>
            <div style={{ width: 48 }}>
              {r.spark && r.spark.length > 0 && <MiniSpark data={r.spark} pos={pos} />}
            </div>
          </Link>
        )
      })}
    </div>
  )
}

/* ── News card ───────────────────────────────────────────────────────────── */
function NewsCard({ loading, news }: { loading: boolean; news: NewsItem[] }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Latest headlines</span>
        <Link href="/app/news" style={{ fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>All news →</Link>
      </div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <LoadingTile count={4} />
        </div>
      ) : news.length === 0 ? (
        <EmptyState
          title="No fresh headlines"
          hint="Finsyt will pull new stories the moment your providers publish them."
        />
      ) : news.map((n, i) => {
        const tone: 'pos' | 'neg' | 'neutral' =
          n.sentiment === 'positive' ? 'pos' :
          n.sentiment === 'negative' ? 'neg' : 'neutral'
        return (
          <a key={n.id || i} href={n.url || '#'} target={n.url ? '_blank' : undefined} rel="noreferrer"
            style={{
              display: 'block', padding: '10px 0',
              borderBottom: i < news.length - 1 ? '1px solid var(--border)' : 'none',
              textDecoration: 'none',
            }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              <span>{n.source || '—'}</span>
              {n.publishedAt && <span>· {relTime(n.publishedAt)}</span>}
              {n.sentiment && tone !== 'neutral' && (
                <Badge tone={tone === 'pos' ? 'green' : 'red'}>{n.sentiment}</Badge>
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.45 }}>
              {n.title}
            </div>
          </a>
        )
      })}
    </div>
  )
}

/* ── Upcoming earnings (driven by user coverage) ─────────────────────────── */
type EarningsItem = { symbol: string; date: string; epsEstimate?: number | null; timing?: string }

type RawQuote = {
  symbol?: string; name?: string; companyName?: string
  price?: number; c?: number
  change?: number; d?: number
  changePct?: number; dp?: number
  spark?: number[]
}

type RawEarning = {
  symbol?: string; ticker?: string
  date?: string; reportDate?: string; earnings_date?: string
  epsEstimate?: number | null; estimate?: number | null; eps_est?: number | null
  timing?: string; time?: string; reportTime?: string
}
function UpcomingEarningsCard({ symbols }: { symbols: string[] }) {
  const [items, setItems]   = useState<EarningsItem[]>([])
  const [loading, setLoad]  = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoad(true)
      try {
        const from = new Date().toISOString().slice(0, 10)
        const to   = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
        const params = new URLSearchParams({ from, to })
        if (symbols.length) params.set('symbols', symbols.join(','))
        const res = await fetch('/api/earnings-calendar?' + params.toString())
        const data = (await res.json()) as {
          earnings?: RawEarning[]; calendar?: RawEarning[]; items?: RawEarning[]
        }
        const raw: RawEarning[] = data.earnings ?? data.calendar ?? data.items ?? []
        const list: EarningsItem[] = raw
          .map((e): EarningsItem => ({
            symbol:      String(e.symbol ?? e.ticker ?? '').toUpperCase(),
            date:        String(e.date ?? e.reportDate ?? e.earnings_date ?? ''),
            epsEstimate: e.epsEstimate ?? e.estimate ?? e.eps_est ?? null,
            timing:      String(e.timing ?? e.time ?? e.reportTime ?? ''),
          }))
          .filter(e => e.symbol && e.date)
          .slice(0, 5)
        if (alive) setItems(list)
      } catch {
        if (alive) setItems([])
      } finally {
        if (alive) setLoad(false)
      }
    }
    load()
    return () => { alive = false }
  }, [symbols.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Earnings ahead</span>
        <Link href="/app/calendar" style={{ fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>Calendar →</Link>
      </div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <LoadingTile count={3} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No upcoming earnings"
          hint="Nothing on your watchlist is reporting in the next two weeks."
        />
      ) : items.map((e, i) => (
        <Link key={e.symbol + e.date} href={`/app/company/${e.symbol}`} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
          borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
          textDecoration: 'none',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8, background: 'var(--accent-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, color: 'var(--accent-text)', flexShrink: 0,
          }}>{e.symbol.slice(0, 2)}</div>
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
    </div>
  )
}

/* ── Workflow Agents strip ───────────────────────────────────────────────── */
function AgentsStrip() {
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
          <Link href="/app/agents/library" style={{
            fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600,
            padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)',
          }}>Browse template library</Link>
          <Link href="/app/agents" style={{ fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 700, padding: '6px 12px' }}>My agents →</Link>
        </div>
      </div>

      {latestUnread && (
        <Link href={`/app/agents/${latestUnread.agentId}/runs/${latestUnread.id}`} style={{
          display: 'block', textDecoration: 'none', marginBottom: 12,
          background: 'var(--accent-dim)', border: '1px solid var(--accent)',
          borderRadius: 12, padding: '14px 16px',
        }}>
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
            <Link key={ag.id} href={`/app/agents/${ag.id}`} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px',
              display: 'flex', gap: 14, alignItems: 'flex-start', textDecoration: 'none',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9, background: 'var(--accent-dim)',
                color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 1,
              }}>
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
              <span style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 7, padding: '5px 10px', fontSize: 11, fontWeight: 700,
                color: 'var(--text-secondary)', flexShrink: 0,
              }}>View →</span>
            </Link>
          )
        })}
        <Link href="/app/agents/new" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '12px 16px', borderRadius: 12,
          border: '1px dashed var(--border)', background: 'transparent',
          color: 'var(--accent-text)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none',
        }}>
          <ACTION_ICONS.plus width={14} height={14} strokeWidth={ICON_STROKE} />
          Create new agent
        </Link>
      </div>
    </div>
  )
}

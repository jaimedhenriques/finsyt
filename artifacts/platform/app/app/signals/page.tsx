'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, Legend, ReferenceLine,
} from 'recharts'
import {
  Card, Badge, Tabs, Button, DataTable, Drawer, EmptyState, Skeleton, Select, FieldLabel, ContextualAskBar, type DataColumn,
} from '@/components/ui'
import { SIGNALS, UNIVERSES, SECTORS, COUNTRIES, type SignalKey, type UniverseKey } from '@/lib/signals'

// ─── Types ──────────────────────────────────────────────────────────────────
interface RankRow {
  rank: number; symbol: string; name: string; sector: string; country: string;
  marketCap: number; date: string; value: number; spark: number[]; priceChangePct: number;
  source?: 'nlp' | 'modeled';
}
interface RankingResponse {
  ok: boolean; asOf?: string; universeSize?: number; coveredCount?: number; rows?: RankRow[];
  reason?: string; message?: string;
}
interface ReturnsSeriesPoint { month: string; d1: number; d10: number; benchmark: number }
interface ReturnsSummaryRow  { horizon: string; d1: number | null; d10: number | null; spread: number | null }
interface ReturnsResponse {
  ok: boolean; asOf?: string; series?: ReturnsSeriesPoint[]; summary?: ReturnsSummaryRow[];
  benchmarkLabel?: string; observations?: number; reason?: string; message?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmtCap = (n: number) => n >= 1e12 ? `$${(n/1e12).toFixed(2)}T` : n >= 1e9 ? `$${(n/1e9).toFixed(0)}B` : `$${(n/1e6).toFixed(0)}M`
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
const fmtVal = (n: number, dp = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(dp)}`

function MiniSpark({ data, pos }: { data: number[]; pos: boolean }) {
  if (!data?.length) return null
  return (
    <div style={{ width: 100, height: 28 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.map((v, i) => ({ v, i }))}>
          <defs>
            <linearGradient id={`sg-${pos ? 'g' : 'r'}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={pos ? 'var(--pos)' : 'var(--neg)'} stopOpacity={0.35}/>
              <stop offset="95%" stopColor={pos ? 'var(--pos)' : 'var(--neg)'} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={pos ? 'var(--pos)' : 'var(--neg)'} strokeWidth={1.4} fill={`url(#sg-${pos ? 'g' : 'r'})`} dot={false}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function SignalsPage() {
  const [tab, setTab] = useState<'ranking' | 'returns'>('ranking')
  const [methodologyOpen, setMethodologyOpen] = useState(false)

  return (
    <div style={{ padding: '1.5rem 1.75rem 2.5rem', maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 className="page-title">Signals & Returns</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Rank your universe by Finsyt's NLP signals — and back-test them like a quant desk would.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={() => setMethodologyOpen(true)}>
            How signals are computed
          </Button>
        </div>
      </div>

      <ContextualAskBar
        context="Signals & Returns"
        contextData={{ page: 'signals' }}
        chips={[
          { label: 'Top decile this week',  prompt: 'Which names sit in the top decile of my active signal this week and what is driving the rank for each?' },
          { label: 'Backtest a hypothesis', prompt: 'Sketch a back-test for buying the top decile and shorting the bottom decile of the active signal — what window and rebalance cadence?' },
          { label: 'Signal decay',           prompt: 'How quickly does the active signal decay after entry? Give me the realistic holding-period sweet-spot.' },
          { label: 'Combine two signals',    prompt: 'Suggest a sensible composite of two of my available signals and explain why the combination should outperform either alone.' },
        ]}
        placeholder="Ask Finsyt about signals and back-tests…"
        style={{ margin: '0 0 16px' }}
      />

      <div style={{ marginBottom: 18 }}>
        <Tabs
          value={tab}
          onChange={v => setTab(v as 'ranking' | 'returns')}
          items={[
            { id: 'ranking', label: 'Ranking' },
            { id: 'returns', label: 'Returns (Decile back-test)' },
          ]}
        />
      </div>

      {tab === 'ranking' ? <RankingView /> : <ReturnsView />}

      <Drawer open={methodologyOpen} onClose={() => setMethodologyOpen(false)} title="How signals are computed" width={500}>
        <MethodologyContent />
      </Drawer>
    </div>
  )
}

// ─── Ranking view ───────────────────────────────────────────────────────────
type RankTab = 'all' | 'top' | 'bottom'

type SortableKey = 'rank' | 'symbol' | 'value' | 'priceChangePct' | 'marketCap' | 'sector' | 'country'

function getSortValue(row: RankRow, key: SortableKey): string | number {
  switch (key) {
    case 'rank':           return row.rank
    case 'symbol':         return row.symbol
    case 'value':          return row.value
    case 'priceChangePct': return row.priceChangePct
    case 'marketCap':      return row.marketCap
    case 'sector':         return row.sector
    case 'country':        return row.country
  }
}

function RankingView() {
  const router = useRouter()
  const [signal, setSignal]     = useState<SignalKey>('sentiment_change')
  const [universe, setUniverse] = useState<UniverseKey>('sp500')
  const [sector, setSector]     = useState('All')
  const [country, setCountry]   = useState('All')
  const [minCapB, setMinCapB]   = useState<number | ''>('')
  const [asOfBack, setAsOfBack] = useState<number>(0)   // months back from today; 0 = latest

  const [data, setData]         = useState<RankingResponse | null>(null)
  const [loading, setLoading]   = useState(true)
  const [view, setView]         = useState<RankTab>('all')
  const [sortBy, setSortBy]     = useState<SortableKey>('rank')
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc')
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // Compute as-of date from months-back selector. Anchored to first-of-month
  // for older dates so the cross-section is stable for back-tests.
  const asOfDate = useMemo(() => {
    if (asOfBack === 0) return undefined
    const t = new Date()
    const d = new Date(t.getFullYear(), t.getMonth() - asOfBack, 1)
    return d.toISOString().slice(0, 10)
  }, [asOfBack])

  useEffect(() => {
    setLoading(true); setPage(1)
    const qs = new URLSearchParams({
      universe, signal, sector, country,
      ...(minCapB !== '' ? { minCapB: String(minCapB) } : {}),
      ...(asOfDate ? { asOfDate } : {}),
    }).toString()
    fetch(`/api/signals/ranking?${qs}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => setData({ ok: false, reason: 'fetch_failed', message: 'Could not load signal data.' }))
      .finally(() => setLoading(false))
  }, [universe, signal, sector, country, minCapB, asOfDate])

  const signalDef = SIGNALS.find(s => s.key === signal)!

  const filtered = useMemo(() => {
    if (!data?.ok || !data.rows) return [] as RankRow[]
    let rows = data.rows
    if (view === 'top')    rows = rows.slice(0, Math.max(20, Math.ceil(rows.length * 0.2)))
    if (view === 'bottom') rows = rows.slice(-Math.max(20, Math.ceil(rows.length * 0.2))).slice().reverse()
    return rows
  }, [data, view])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = getSortValue(a, sortBy)
      const bv = getSortValue(b, sortBy)
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      const an = Number(av), bn = Number(bv)
      return sortDir === 'asc' ? an - bn : bn - an
    })
    return arr
  }, [filtered, sortBy, sortDir])

  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize)
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))

  function toggleSort(k: string) {
    const key = k as SortableKey
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir(key === 'rank' || key === 'symbol' ? 'asc' : 'desc') }
  }

  const cols: DataColumn<RankRow>[] = [
    { key: 'rank', header: '#', sortable: true, width: 56, render: r => (
      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', fontWeight: 600 }}>{r.rank}</span>
    )},
    { key: 'symbol', header: 'Company', sortable: true, render: r => (
      <Link href={`/app/company/${r.symbol}`} style={{ textDecoration: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.symbol}</span>
          {r.source === 'nlp' && (
            <span title="Score grounded in published NLP coverage" style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.04em',
              padding: '1px 5px', borderRadius: 3,
              background: 'var(--accent-dim)', color: 'var(--accent-text)',
            }}>NLP</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
      </Link>
    )},
    { key: 'date', header: 'As of', render: r => (
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{r.date}</span>
    )},
    { key: 'value', header: signalDef.short, sortable: true, align: 'right', render: r => {
      const positive = r.value >= 0
      return (
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 6,
          background: positive ? 'var(--pos-dim)' : 'var(--neg-dim)',
          color: positive ? 'var(--pos)' : 'var(--neg)',
          fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 12,
        }}>
          {fmtVal(r.value, signal === 'sentiment_change' ? 2 : 1)}{signalDef.unit}
        </span>
      )
    }},
    { key: 'priceChangePct', header: 'Px Δ 30d', sortable: true, align: 'right', render: r => (
      <span className={r.priceChangePct >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtPct(r.priceChangePct)}</span>
    )},
    { key: 'marketCap', header: 'Mkt Cap', sortable: true, align: 'right', render: r => (
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCap(r.marketCap)}</span>
    )},
    { key: 'sector', header: 'Sector', sortable: true, render: r => <Badge tone="gray">{r.sector}</Badge> },
    { key: 'country', header: 'Country', sortable: true, render: r => <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.country}</span> },
    { key: 'spark', header: 'Price 30d', render: r => <MiniSpark data={r.spark} pos={r.priceChangePct >= 0}/> },
    { key: '_view', header: '', render: r => (
      <Link href={`/app/company/${r.symbol}`} className="btn btn-outline btn-sm">Open →</Link>
    )},
  ]

  return (
    <>
      {/* Filter bar */}
      <Card padding={14} style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 0.9fr 0.9fr', gap: 12, alignItems: 'end' }}>
          <div>
            <FieldLabel>Signal</FieldLabel>
            <Select fieldSize="sm" value={signal} onChange={e => setSignal(e.target.value as SignalKey)}>
              {SIGNALS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>Universe</FieldLabel>
            <Select fieldSize="sm" value={universe} onChange={e => setUniverse(e.target.value as UniverseKey)}>
              {UNIVERSES.map(u => <option key={u.key} value={u.key}>{u.label}{!u.covered ? ' (preview)' : ''}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>Sector</FieldLabel>
            <Select fieldSize="sm" value={sector} onChange={e => setSector(e.target.value)}>
              <option>All</option>{SECTORS.map(s => <option key={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>Country</FieldLabel>
            <Select fieldSize="sm" value={country} onChange={e => setCountry(e.target.value)}>
              <option>All</option>{COUNTRIES.map(c => <option key={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>As of</FieldLabel>
            <Select fieldSize="sm" value={String(asOfBack)} onChange={e => setAsOfBack(Number(e.target.value))}>
              <option value="0">Latest</option>
              <option value="1">1 month ago</option>
              <option value="3">3 months ago</option>
              <option value="6">6 months ago</option>
              <option value="12">1 year ago</option>
              <option value="24">2 years ago</option>
            </Select>
          </div>
          <div>
            <FieldLabel>Min Mkt Cap ($B)</FieldLabel>
            <Select fieldSize="sm" value={String(minCapB)} onChange={e => setMinCapB(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">Any</option>
              <option value="10">$10B+</option>
              <option value="50">$50B+</option>
              <option value="100">$100B+</option>
              <option value="500">$500B+</option>
            </Select>
          </div>
        </div>
      </Card>

      {/* Top tabs + count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
        <Tabs
          value={view}
          onChange={v => { setView(v as RankTab); setPage(1) }}
          items={[
            { id: 'all',    label: 'All' },
            { id: 'top',    label: 'Top performers' },
            { id: 'bottom', label: 'Bottom performers' },
          ]}
        />
        {data?.ok && (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <b style={{ color: 'var(--text-primary)' }}>{sorted.length}</b> of {data.universeSize} names · ranked by <b style={{ color: 'var(--text-primary)' }}>{signalDef.label}</b> · as of {data.asOf}
            {typeof data.coveredCount === 'number' && (
              <> · <span title="Tickers grounded in published NLP output (research page); others use modeled scores.">{data.coveredCount} NLP-grounded</span></>
            )}
          </span>
        )}
      </div>

      {/* Body */}
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 18 }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <Skeleton width={32} height={18}/><Skeleton width={120} height={18}/><Skeleton width={80} height={18}/><Skeleton width={120} height={18} style={{ marginLeft: 'auto' }}/>
              </div>
            ))}
          </div>
        ) : !data?.ok ? (
          <EmptyState
            icon="∅"
            title="Insufficient data for these filters"
            hint={data?.message || 'Try a different combination.'}
            action={<Button variant="secondary" size="sm" onClick={() => { setUniverse('sp500'); setSector('All'); setCountry('All'); setMinCapB(''); setAsOfBack(0) }}>Reset filters</Button>}
          />
        ) : sorted.length === 0 ? (
          <EmptyState icon="∅" title="No matches" hint="No companies remain after filtering. Loosen the constraints above."/>
        ) : (
          <>
            <DataTable
              columns={cols}
              rows={pageRows}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={toggleSort}
              getRowKey={r => r.symbol}
              onRowClick={r => router.push(`/app/company/${r.symbol}`)}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Rows per page:</span>
                <Select fieldSize="sm" value={String(pageSize)} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }} style={{ width: 'auto', minWidth: 70 }}>
                  <option>50</option><option>100</option><option>200</option>
                </Select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</Button>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>Page {page} / {totalPages}</span>
                <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next →</Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  )
}

// ─── Returns view ───────────────────────────────────────────────────────────
function ReturnsView() {
  const [signal, setSignal]     = useState<SignalKey>('sentiment_change')
  const [universe, setUniverse] = useState<UniverseKey>('sp500')
  const [months, setMonths]     = useState(24)
  const [interval, setInterval] = useState(1)
  const [calc, setCalc]         = useState<'compounded' | 'simple'>('compounded')

  const [data, setData]   = useState<ReturnsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({
      universe, signal,
      months: String(months), interval: String(interval), calc,
    }).toString()
    fetch(`/api/signals/returns?${qs}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => setData({ ok: false, reason: 'fetch_failed', message: 'Could not load back-test.' }))
      .finally(() => setLoading(false))
  }, [universe, signal, months, interval, calc])

  const signalDef = SIGNALS.find(s => s.key === signal)!

  return (
    <>
      <Card padding={14} style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, alignItems: 'end' }}>
          <div>
            <FieldLabel>Signal</FieldLabel>
            <Select fieldSize="sm" value={signal} onChange={e => setSignal(e.target.value as SignalKey)}>
              {SIGNALS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>Universe</FieldLabel>
            <Select fieldSize="sm" value={universe} onChange={e => setUniverse(e.target.value as UniverseKey)}>
              {UNIVERSES.map(u => <option key={u.key} value={u.key}>{u.label}{!u.covered ? ' (preview)' : ''}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>Timeframe</FieldLabel>
            <Select fieldSize="sm" value={String(months)} onChange={e => setMonths(Number(e.target.value))}>
              <option value="12">Past year</option>
              <option value="24">Past 2 years</option>
              <option value="36">Past 3 years</option>
              <option value="60">Past 5 years</option>
            </Select>
          </div>
          <div>
            <FieldLabel>Rebalance interval</FieldLabel>
            <Select fieldSize="sm" value={String(interval)} onChange={e => setInterval(Number(e.target.value))}>
              <option value="1">Monthly</option>
              <option value="3">Quarterly</option>
              <option value="6">Semi-annually</option>
              <option value="12">Annually</option>
            </Select>
          </div>
          <div>
            <FieldLabel>Returns calculation</FieldLabel>
            <Select fieldSize="sm" value={calc} onChange={e => setCalc(e.target.value as 'compounded' | 'simple')}>
              <option value="compounded">Compounded</option>
              <option value="simple">Simple (additive)</option>
            </Select>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card padding={20}><Skeleton width="100%" height={320}/></Card>
      ) : !data?.ok ? (
        <Card padding={0}>
          <EmptyState icon="∅" title="Insufficient data for this back-test" hint={data?.message || 'Adjust the configuration and try again.'}/>
        </Card>
      ) : (
        <>
          {/* Headline summary band */}
          <Card padding={18} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Decile back-test
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Inter Tight', 'Inter', sans-serif" }}>
                  {signalDef.label} · {data.benchmarkLabel} · {data.observations} months
                </div>
              </div>
              <SummaryStat label="Top decile (D1) total" value={data.series![data.series!.length - 1].d1} />
              <SummaryStat label="Bottom decile (D10) total" value={data.series![data.series!.length - 1].d10} />
              <SummaryStat label="D1 − D10 spread" value={data.series![data.series!.length - 1].d1 - data.series![data.series!.length - 1].d10} highlight />
              <SummaryStat label="Benchmark total" value={data.series![data.series!.length - 1].benchmark} muted />
            </div>
          </Card>

          {/* Chart */}
          <Card padding={18} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Cumulative returns over time (%)</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{calc === 'compounded' ? 'Compounded' : 'Simple sum'} · rebalanced {interval === 1 ? 'monthly' : `every ${interval} months`}</div>
            </div>
            <div style={{ width: '100%', height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.series} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false}/>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false}/>
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} tickFormatter={v => `${v}%`}/>
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'var(--text-secondary)' }}
                    formatter={(v: number, n: string) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, n === 'd1' ? 'Top decile (D1)' : n === 'd10' ? 'Bottom decile (D10)' : 'Benchmark']}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }}
                    formatter={(v: string) => v === 'd1' ? 'Top decile (D1)' : v === 'd10' ? 'Bottom decile (D10)' : 'Benchmark'}
                  />
                  <ReferenceLine y={0} stroke="var(--border)"/>
                  <Line type="monotone" dataKey="d1" stroke="var(--pos)" strokeWidth={2} dot={false}/>
                  <Line type="monotone" dataKey="d10" stroke="var(--neg)" strokeWidth={2} dot={false}/>
                  <Line type="monotone" dataKey="benchmark" stroke="var(--text-secondary)" strokeWidth={1.5} strokeDasharray="4 4" dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Average horizon table */}
          <Card padding={0} style={{ overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Average forward returns by horizon</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Across all overlapping windows in the selected timeframe</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Horizon</th>
                  <th className="right">Top decile (D1)</th>
                  <th className="right">Bottom decile (D10)</th>
                  <th className="right">D1 − D10 spread</th>
                </tr>
              </thead>
              <tbody>
                {data.summary!.map(r => {
                  const na = r.d1 === null || r.d10 === null || r.spread === null
                  if (na) return (
                    <tr key={r.horizon}>
                      <td><b>{r.horizon}</b></td>
                      <td className="right" style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>N/A</td>
                      <td className="right" style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>N/A</td>
                      <td className="right" style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>insufficient history</td>
                    </tr>
                  )
                  return (
                    <tr key={r.horizon}>
                      <td><b>{r.horizon}</b></td>
                      <td className="right"><span className={r.d1! >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtPct(r.d1!)}</span></td>
                      <td className="right"><span className={r.d10! >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtPct(r.d10!)}</span></td>
                      <td className="right">
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                          background: r.spread! >= 0 ? 'var(--pos-dim)' : 'var(--neg-dim)',
                          color: r.spread! >= 0 ? 'var(--pos)' : 'var(--neg)',
                          fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontSize: 12,
                        }}>{fmtPct(r.spread!)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>

          {/* Methodology footnote */}
          <div style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary)', padding: '0 4px' }}>
            <b style={{ color: 'var(--text-primary)' }}>Methodology.</b> Each rebalancing date the universe is sorted by <i>{signalDef.label}</i>; the top 10% form D1 and the bottom 10% form D10. Decile portfolios are equal-weighted and held for the rebalance interval, then rebuilt. Returns are gross of fees and {calc === 'compounded' ? 'compounded month-on-month' : 'summed period-by-period'}. Benchmark = {data.benchmarkLabel} equal-weighted. Past performance does not predict future results.
          </div>
        </>
      )}
    </>
  )
}

function SummaryStat({ label, value, highlight, muted }: { label: string; value: number; highlight?: boolean; muted?: boolean }) {
  const positive = value >= 0
  const color = muted ? 'var(--text-secondary)' : positive ? 'var(--pos)' : 'var(--neg)'
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: highlight ? 22 : 18,
        fontWeight: 800,
        color,
        fontVariantNumeric: 'tabular-nums',
        fontFamily: "'Inter Tight', 'Inter', sans-serif",
      }}>{fmtPct(value)}</div>
    </div>
  )
}

// ─── Methodology drawer content ─────────────────────────────────────────────
function MethodologyContent() {
  return (
    <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
      <p style={{ marginTop: 0 }}>
        Finsyt converts every company filing, transcript and news item into a set of NLP-derived
        scores. The Signals page exposes these scores as <b>quantitative signals</b> you can rank
        and back-test, the way professional desks evaluate alpha sources.
      </p>
      <h4 style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginTop: 18, marginBottom: 8 }}>Signals</h4>
      <ul style={{ paddingLeft: 18, margin: 0 }}>
        {SIGNALS.map(s => (
          <li key={s.key} style={{ marginBottom: 8 }}>
            <b style={{ color: 'var(--accent-text)' }}>{s.label}.</b> {s.help}
          </li>
        ))}
      </ul>
      <h4 style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginTop: 18, marginBottom: 8 }}>How decile back-tests work</h4>
      <p style={{ margin: 0 }}>
        On every rebalance date, we sort the chosen universe by the chosen signal. The top 10% form
        the D1 portfolio, the bottom 10% form the D10 portfolio; both are equal-weighted and held
        until the next rebalance. The chart and table show their cumulative and average returns
        versus the benchmark. A persistently positive D1 − D10 spread indicates the signal carries
        information about future returns within that universe.
      </p>
      <h4 style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginTop: 18, marginBottom: 8 }}>Coverage & limitations</h4>
      <p style={{ margin: 0 }}>
        Universe coverage today: <b>S&amp;P 500</b> and <b>Nasdaq 100</b>. Russell 2000, STOXX
        Europe 600 and Nikkei 225 are on the roadmap and currently return an explicit
        insufficient-data response rather than a synthetic zero.
      </p>
      <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
        Returns are gross of fees, slippage and borrow costs. This is research, not trade
        execution — the platform does not route orders.
      </p>
    </div>
  )
}

'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { ContextualAskBar } from '@/components/ui'
import GeopoliticalTile from '@/components/intelligence/GeopoliticalTile'
import TradeFlowsTile from '@/components/intelligence/TradeFlowsTile'
import NewsBriefTile from '@/components/intelligence/NewsBriefTile'
import GlobalMacroExplorer from '@/components/macro/GlobalMacroExplorer'
import GeopoliticalEventsCard from '@/components/macro/GeopoliticalEventsCard'

// ── Types ─────────────────────────────────────────────────────────────────────
interface MacroSeries { label: string; value: string; prev: string; period: string; trend: 'up' | 'down' | 'flat'; source: string; key: string }
interface ChartPoint  { date: string; value: number }
interface CensusDemoPoint { year: number; medianIncome: number | null; population: number | null; unemploymentRate: number | null }

const INDICATORS = [
  { key:'GDP_GROWTH_RATE',   label:'US GDP Growth',        unit:'%',  format:'pct' },
  { key:'INFLATION_RATE',    label:'CPI Inflation',         unit:'%',  format:'pct' },
  { key:'UNEMPLOYMENT_RATE', label:'Unemployment Rate',     unit:'%',  format:'pct' },
  { key:'INTEREST_RATE',     label:'Fed Funds Rate',        unit:'%',  format:'pct' },
  { key:'YIELD_10Y',         label:'10Y Treasury Yield',    unit:'%',  format:'pct' },
  { key:'YIELD_2Y',          label:'2Y Treasury Yield',     unit:'%',  format:'pct' },
  { key:'YIELD_SPREAD',      label:'10Y-2Y Yield Spread',   unit:'%',  format:'spread' },
  { key:'RETAIL_SALES',      label:'Retail Sales',          unit:'B',  format:'bn' },
  { key:'CONSUMER_CONFIDENCE',label:'Consumer Confidence',  unit:'',   format:'num' },
  { key:'HOUSING_STARTS',    label:'Housing Starts',        unit:'K',  format:'k' },
  { key:'NONFARM_PAYROLLS',  label:'Nonfarm Payrolls',      unit:'K',  format:'k' },
  { key:'PCE_INFLATION',     label:'PCE Inflation',         unit:'%',  format:'pct' },
]

const COUNTRY_OPTIONS = [
  { value:'US', label:'United States' },
  { value:'GB', label:'United Kingdom' },
  { value:'EU', label:'Eurozone' },
  { value:'JP', label:'Japan' },
  { value:'CN', label:'China' },
]

function sparkColor(trend: string) {
  return trend === 'up' ? 'var(--pos)' : trend === 'down' ? 'var(--neg)' : '#7D8FA9'
}

function trendIcon(trend: string) {
  return trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:12, boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>{label}</div>
      <div style={{ color:'var(--accent)', fontWeight:600 }}>{payload[0]?.value?.toFixed(2)}</div>
    </div>
  )
}

export default function MacroPage() {
  const [country, setCountry]       = useState('US')
  const [snapshot, setSnapshot]     = useState<MacroSeries[]>([])
  const [chartKey, setChartKey]     = useState('YIELD_10Y')
  const [chartData, setChartData]   = useState<ChartPoint[]>([])
  const [loadingSnap, setLoadingSnap] = useState(true)
  const [loadingChart, setLoadingChart] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadSnapshot = useCallback(async () => {
    setLoadingSnap(true)
    try {
      const res  = await fetch(`/api/macro?country=${country}&all=true`)
      const data = await res.json()
      if (data?.indicators) {
        const mapped: MacroSeries[] = data.indicators.map((ind: any) => ({
          key:    ind.key || '',
          label:  INDICATORS.find(i => i.key === ind.key)?.label || ind.key,
          value:  ind.value != null ? String(ind.value) : '—',
          prev:   ind.prev  != null ? String(ind.prev)  : '—',
          period: ind.date  || ind.period || '',
          trend:  ind.trend || (Number(ind.value) > Number(ind.prev) ? 'up' : Number(ind.value) < Number(ind.prev) ? 'down' : 'flat'),
          source: ind.source || 'FRED',
        }))
        setSnapshot(mapped)
      }
    } catch (e) {
      console.error('Macro snapshot failed:', e)
    } finally {
      setLoadingSnap(false)
      setLastUpdated(new Date())
    }
  }, [country])

  const loadChart = useCallback(async () => {
    setLoadingChart(true)
    try {
      const res  = await fetch(`/api/macro?indicator=${chartKey}&country=${country}&periods=60`)
      const data = await res.json()
      const raw  = data?.series || data?.values || []
      const pts: ChartPoint[] = raw
        .filter((p: any) => p.date && p.value != null)
        .map((p: any) => ({ date: p.date, value: Number(p.value) }))
        .reverse()
      setChartData(pts)
    } catch {}
    finally { setLoadingChart(false) }
  }, [chartKey, country])

  useEffect(() => { loadSnapshot() }, [loadSnapshot])
  useEffect(() => { loadChart()    }, [loadChart])

  const selectedInd = INDICATORS.find(i => i.key === chartKey)

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title">Macro Dashboard</h1>
          <p style={{ fontSize:13, marginTop:2, color:'#7D8FA9' }}>Economic indicators · yield curves · central bank data</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <select value={country} onChange={e => setCountry(e.target.value)}
            style={{ padding:'7px 12px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:13, fontFamily:'inherit', fontWeight:600, color:'var(--text-primary)', background: '#fff', cursor:'pointer' }}>
            {COUNTRY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {lastUpdated && <span style={{ fontSize:11, color:'#B0BCD0' }}>Updated {lastUpdated.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span>}
          <button onClick={() => { loadSnapshot(); loadChart() }}
            style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid var(--border)', background: '#fff', cursor:'pointer', fontSize:12, fontWeight:600, color:'#4A5568' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      <ContextualAskBar
        context="Macro Dashboard"
        contextData={{ page: 'macro', country, indicator: chartKey }}
        chips={[
          { label: 'CPI implications',  prompt: 'Read the latest CPI print and explain implications for rates, equities, and currency cross-pairs.' },
          { label: 'Fed path 6 months', prompt: "Map the Fed's most likely policy path over the next 6 months and what each scenario means for risk assets." },
          { label: 'Yield curve',       prompt: 'Interpret the current yield curve shape — what is it pricing in for growth and inflation 12 months out?' },
          { label: 'Recession odds',    prompt: 'Aggregate the leading indicators on this page into a recession probability and explain the drivers.' },
        ]}
        placeholder="Ask Finsyt to interpret the macro picture…"
        style={{ margin: '0 0 16px' }}
      />

      {/* KPI grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12, marginBottom:24 }}>
        {loadingSnap
          ? INDICATORS.slice(0,8).map((_, i) => (
              <div key={i} className="metric-card" style={{ height:88, borderRadius:12, background:'#F8FAFD', animation:'pulse 1.5s infinite' }} />
            ))
          : (snapshot.length > 0 ? snapshot : INDICATORS.map(ind => ({
              key: ind.key, label: ind.label, value:'—', prev:'—', period:'', trend:'flat' as const, source:'FRED'
            }))).map(ind => (
              <div key={ind.key} className="metric-card"
                onClick={() => setChartKey(ind.key)}
                style={{ cursor:'pointer', border: chartKey === ind.key ? '2px solid var(--accent)' : '1px solid var(--border)', borderRadius:12 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:'#7D8FA9', textTransform:'uppercase', letterSpacing:'0.04em' }}>{ind.label}</span>
                  <span style={{ fontSize:16, color: sparkColor(ind.trend) }}>{trendIcon(ind.trend)}</span>
                </div>
                <div style={{ fontWeight:900, fontSize:'1.5rem', color:'#0A1628', letterSpacing:'-0.03em', lineHeight:1 }}>{ind.value}</div>
                <div style={{ fontSize:11, color:'#B0BCD0', marginTop:6 }}>
                  Prev: {ind.prev} · {ind.period} · <span style={{ fontWeight:600 }}>{ind.source}</span>
                </div>
              </div>
            ))
        }
      </div>

      {/* Chart */}
      <div className="card" style={{ overflow:'hidden', marginBottom:24 }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #E2E8F2', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div>
            <span style={{ fontWeight:700, fontSize:14, color:'#0A1628' }}>{selectedInd?.label || chartKey}</span>
            <span style={{ marginLeft:8, fontSize:11, color:'#B0BCD0' }}>60 data points · {country}</span>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {INDICATORS.slice(0, 8).map(ind => (
              <button key={ind.key} onClick={() => setChartKey(ind.key)}
                style={{ padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer', border:'1.5px solid', transition:'all 0.1s',
                  borderColor: chartKey===ind.key ? 'var(--accent)' : 'var(--border)',
                  background:  chartKey===ind.key ? 'var(--accent)' : '#fff',
                  color:       chartKey===ind.key ? '#fff'    : '#7D8FA9',
                }}>
                {ind.label.split(' ').slice(-1)[0]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding:16, height:280 }}>
          {loadingChart ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#B0BCD0', fontSize:13 }}>Loading chart data…</div>
          ) : chartData.length === 0 ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#B0BCD0', fontSize:13 }}>No chart data available for this indicator</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top:8, right:12, bottom:0, left:0 }}>
                <defs>
                  <linearGradient id="macroGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor='var(--accent)' stopOpacity={0.15} />
                    <stop offset="95%" stopColor='var(--accent)' stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize:10, fill:'var(--text-muted)' }} tickLine={false}
                  tickFormatter={v => v?.slice(0,7)} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize:10, fill:'var(--text-muted)' }} tickLine={false} axisLine={false}
                  tickFormatter={v => v?.toFixed(2)} width={45} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="value" stroke='var(--accent)' strokeWidth={2}
                  fill="url(#macroGrad)" dot={false} activeDot={{ r:4, fill:'var(--accent)' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Global cross-country macro search & compare (IMF · World Bank · DBnomics) */}
      <GlobalMacroExplorer />

      {/* US Demographics & Income (Census ACS5, 24h cache) */}
      <CensusDemographicsCard />

      {/* ── Global Intelligence tiles (geopolitical risk, trade flows, news brief) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '24px 0 12px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Global Intelligence</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>World Bank WGI · UN Comtrade · GDELT</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
        <GeopoliticalTile iso="US" countryName="United States" />
        <TradeFlowsTile defaultCountry="US" defaultCommodity="semiconductors" />
        <NewsBriefTile topic="global macroeconomics interest rates inflation" title="Macro Intelligence Brief" />
      </div>

      {/* Geopolitical risk & events feed (Task #400, GDELT open data) */}
      <GeopoliticalEventsCard />

      {/* Yield curve snapshot (live, from the Fixed Income & Rates Desk) */}
      <MacroYieldCurveCard />
    </div>
  )
}

// ─── US Treasury Yield Curve (live) ──────────────────────────────────────────
// Replaces the former hard-coded curve with real data from the Fixed Income &
// Rates Desk (/api/rates/yield-curve → FRED keyed/public + Yahoo fallback).
function MacroYieldCurveCard() {
  const [points, setPoints] = useState<{ tenor: string; months: number; yield: number | null }[]>([])
  const [meta, setMeta] = useState<{ asOf: string | null; source: string }>({ asOf: null, source: 'none' })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setErr(null)
    fetch((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/api/rates/yield-curve')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.error) { setErr(d.error); return }
        const pts = (d.points || [])
          .filter((p: any) => p.yield != null)
          .map((p: any) => ({ tenor: p.tenor, months: p.months, yield: p.yield }))
          .sort((a: any, b: any) => a.months - b.months)
        setPoints(pts)
        setMeta({ asOf: d.asOf || null, source: d.source || 'none' })
      })
      .catch(e => { if (!cancelled) setErr((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="card" style={{ overflow:'hidden', marginTop: 24 }}>
      <div style={{ padding:'12px 20px', borderBottom:'1px solid #E2E8F2', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <span style={{ fontWeight:700, fontSize:14, color:'#0A1628' }}>US Treasury Yield Curve</span>
        <a href={(process.env.NEXT_PUBLIC_BASE_PATH || '') + '/app/rates'}
          style={{ fontSize:11, color:'#B0BCD0', textDecoration:'none' }}>
          {meta.asOf ? `as of ${meta.asOf} · ` : ''}source: {meta.source === 'none' ? '—' : meta.source} · Open Rates Desk →
        </a>
      </div>
      <div style={{ padding:16, height:200 }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#B0BCD0', fontSize:13 }}>Loading yield curve…</div>
        ) : err ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--neg)', fontSize:13 }}>Yield curve error: {err}</div>
        ) : points.length === 0 ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#B0BCD0', fontSize:13 }}>No yield-curve data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top:8, right:12, bottom:0, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" />
              <XAxis dataKey="tenor" tick={{ fontSize:11, fill:'#7D8FA9' }} tickLine={false} />
              <YAxis tick={{ fontSize:10, fill:'var(--text-muted)' }} tickLine={false} axisLine={false}
                domain={['auto','auto']} tickFormatter={v => `${v.toFixed(2)}%`} width={50} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, 'Yield']} />
              <Line type="monotone" dataKey="yield" stroke='var(--accent)' strokeWidth={2.5}
                dot={{ fill:'var(--accent)', r:4 }} activeDot={{ r:6 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ─── US Demographics & Income (Census ACS5) ──────────────────────────────────
// Charts a multi-year time series of US median household income with
// population & unemployment KPIs. Backed by /api/census/us-demographics
// which caches the upstream Census Bureau data for 24h.
function CensusDemographicsCard() {
  const [series, setSeries] = useState<CensusDemoPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [metric, setMetric] = useState<'medianIncome' | 'population' | 'unemploymentRate'>('medianIncome')
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setErr(null)
    fetch((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/api/census/us-demographics')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.error) { setErr(d.error); return }
        setSeries(Array.isArray(d.series) ? d.series : [])
        setFetchedAt(d.fetchedAt || null)
      })
      .catch(e => { if (!cancelled) setErr((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const latest = series[series.length - 1]
  const prior  = series[series.length - 2]
  const fmtMoney = (n: number | null) => n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US')
  const fmtPop   = (n: number | null) => n == null ? '—' : (n / 1e6).toFixed(1) + 'M'
  const fmtPct   = (n: number | null) => n == null ? '—' : n.toFixed(2) + '%'
  const delta = (a: number | null, b: number | null) => {
    if (a == null || b == null || b === 0) return null
    return ((a - b) / Math.abs(b)) * 100
  }

  const chartData = series
    .filter(p => p[metric] != null)
    .map(p => ({ date: String(p.year), value: Number(p[metric]) }))

  const metricLabel = metric === 'medianIncome' ? 'Median Household Income'
    : metric === 'population' ? 'Total Population'
    : 'Unemployment Rate'
  const yFmt = (v: number) => metric === 'medianIncome'
    ? '$' + (v / 1000).toFixed(0) + 'K'
    : metric === 'population' ? (v / 1e6).toFixed(0) + 'M'
    : v.toFixed(1) + '%'

  return (
    <div className="card" style={{ overflow:'hidden', marginBottom:24 }}>
      <div style={{ padding:'12px 20px', borderBottom:'1px solid #E2E8F2', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <span style={{ fontWeight:700, fontSize:14, color:'#0A1628' }}>US Demographics & Income</span>
          <span style={{ marginLeft:8, fontSize:11, color:'#B0BCD0' }}>
            Source: U.S. Census Bureau · ACS 5-Year{fetchedAt ? ` · cached ${new Date(fetchedAt).toLocaleDateString()}` : ''}
          </span>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {([
            { k:'medianIncome',     label:'Median Income' },
            { k:'population',       label:'Population' },
            { k:'unemploymentRate', label:'Unemployment' },
          ] as const).map(b => (
            <button key={b.k} onClick={() => setMetric(b.k)}
              style={{ padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer', border:'1.5px solid', transition:'all 0.1s',
                borderColor: metric === b.k ? 'var(--accent)' : 'var(--border)',
                background:  metric === b.k ? 'var(--accent)' : '#fff',
                color:       metric === b.k ? '#fff'          : '#7D8FA9' }}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:1, background:'#E2E8F2' }}>
        <KpiTile label="Median household income" value={fmtMoney(latest?.medianIncome ?? null)} sub={`B19013 · ${latest?.year ?? ''}`} delta={delta(latest?.medianIncome ?? null, prior?.medianIncome ?? null)} fmtDelta={n => n.toFixed(1) + '% YoY'} />
        <KpiTile label="Total population"        value={fmtPop(latest?.population ?? null)}    sub={`B01003 · ${latest?.year ?? ''}`} delta={delta(latest?.population ?? null, prior?.population ?? null)} fmtDelta={n => n.toFixed(2) + '% YoY'} />
        <KpiTile label="Unemployment rate"       value={fmtPct(latest?.unemploymentRate ?? null)} sub={`B23025 · ${latest?.year ?? ''}`} delta={delta(latest?.unemploymentRate ?? null, prior?.unemploymentRate ?? null)} fmtDelta={n => (n>=0?'+':'') + n.toFixed(2) + ' bps YoY'} invertColor />
      </div>

      <div style={{ padding:16, height:240 }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#B0BCD0', fontSize:13 }}>Loading Census ACS5 series…</div>
        ) : err ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--neg)', fontSize:13 }}>Census error: {err}</div>
        ) : chartData.length === 0 ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#B0BCD0', fontSize:13 }}>No Census data available for this metric.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top:8, right:12, bottom:0, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize:11, fill:'#7D8FA9' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize:10, fill:'var(--text-muted)' }} tickLine={false} axisLine={false}
                domain={['auto','auto']} tickFormatter={yFmt} width={56} />
              <Tooltip
                formatter={(v: number) => [yFmt(v), metricLabel]}
                labelFormatter={(l: string) => `Year ${l}`}
                contentStyle={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }}
              />
              <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2.5}
                dot={{ fill:'var(--accent)', r:3 }} activeDot={{ r:5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function KpiTile({ label, value, sub, delta, fmtDelta, invertColor }: {
  label: string; value: string; sub?: string;
  delta: number | null; fmtDelta: (n: number) => string; invertColor?: boolean
}) {
  const tone = delta == null ? 'flat'
    : invertColor ? (delta < 0 ? 'pos' : delta > 0 ? 'neg' : 'flat')
    : (delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'flat')
  const color = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : '#7D8FA9'
  return (
    <div style={{ background:'#fff', padding:'12px 16px' }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#7D8FA9', textTransform:'uppercase', letterSpacing:'0.04em' }}>{label}</div>
      <div style={{ fontWeight:900, fontSize:'1.4rem', color:'#0A1628', letterSpacing:'-0.02em', marginTop:4 }}>{value}</div>
      <div style={{ fontSize:11, color:'#B0BCD0', marginTop:4, display:'flex', gap:8, alignItems:'baseline' }}>
        <span>{sub}</span>
        {delta != null && <span style={{ color, fontWeight:700 }}>{fmtDelta(delta)}</span>}
      </div>
    </div>
  )
}

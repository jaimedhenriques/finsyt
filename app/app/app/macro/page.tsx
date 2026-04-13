'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────
interface MacroSeries { label: string; value: string; prev: string; period: string; trend: 'up' | 'down' | 'flat'; source: string; key: string }
interface ChartPoint  { date: string; value: number }

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
  return trend === 'up' ? '#059669' : trend === 'down' ? '#DC2626' : '#7D8FA9'
}

function trendIcon(trend: string) {
  return trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#fff', border:'1px solid #E2E8F2', borderRadius:8, padding:'8px 12px', fontSize:12, boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight:700, color:'#0A1628', marginBottom:4 }}>{label}</div>
      <div style={{ color:'#1B4FFF', fontWeight:600 }}>{payload[0]?.value?.toFixed(2)}</div>
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
            style={{ padding:'7px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', fontWeight:600, color:'#1C2B4A', background:'#fff', cursor:'pointer' }}>
            {COUNTRY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {lastUpdated && <span style={{ fontSize:11, color:'#B0BCD0' }}>Updated {lastUpdated.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span>}
          <button onClick={() => { loadSnapshot(); loadChart() }}
            style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600, color:'#4A5568' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

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
                style={{ cursor:'pointer', border: chartKey === ind.key ? '2px solid #1B4FFF' : '1px solid #E2E8F2', borderRadius:12 }}>
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
                  borderColor: chartKey===ind.key ? '#1B4FFF' : '#E2E8F2',
                  background:  chartKey===ind.key ? '#1B4FFF' : '#fff',
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
                    <stop offset="5%"  stopColor="#1B4FFF" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#1B4FFF" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" />
                <XAxis dataKey="date" tick={{ fontSize:10, fill:'#B0BCD0' }} tickLine={false}
                  tickFormatter={v => v?.slice(0,7)} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize:10, fill:'#B0BCD0' }} tickLine={false} axisLine={false}
                  tickFormatter={v => v?.toFixed(2)} width={45} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="#E2E8F2" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="value" stroke="#1B4FFF" strokeWidth={2}
                  fill="url(#macroGrad)" dot={false} activeDot={{ r:4, fill:'#1B4FFF' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Yield curve snapshot */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #E2E8F2' }}>
          <span style={{ fontWeight:700, fontSize:14, color:'#0A1628' }}>US Treasury Yield Curve</span>
        </div>
        <div style={{ padding:16, height:200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={[
                { tenor:'1M', yield: 5.32 }, { tenor:'3M', yield: 5.28 }, { tenor:'6M', yield: 5.21 },
                { tenor:'1Y', yield: 5.01 }, { tenor:'2Y', yield: 4.59 }, { tenor:'5Y', yield: 4.31 },
                { tenor:'10Y',yield: 4.22 }, { tenor:'20Y',yield: 4.51 }, { tenor:'30Y',yield: 4.42 },
              ]}
              margin={{ top:8, right:12, bottom:0, left:0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" />
              <XAxis dataKey="tenor" tick={{ fontSize:11, fill:'#7D8FA9' }} tickLine={false} />
              <YAxis tick={{ fontSize:10, fill:'#B0BCD0' }} tickLine={false} axisLine={false}
                domain={['auto','auto']} tickFormatter={v => `${v.toFixed(2)}%`} width={50} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, 'Yield']} />
              <Line type="monotone" dataKey="yield" stroke="#1B4FFF" strokeWidth={2.5}
                dot={{ fill:'#1B4FFF', r:4 }} activeDot={{ r:6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

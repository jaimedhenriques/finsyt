'use client'
import { useEffect, useState } from 'react'
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const INDICATORS = [
  { key:'GDP_GROWTH_RATE',        label:'US GDP Growth',       country:'US', unit:'%',  icon:'🏛️', desc:'Real GDP quarter-over-quarter annualised growth rate' },
  { key:'INFLATION_CPI_YOY',      label:'US CPI (YoY)',        country:'US', unit:'%',  icon:'📈', desc:'Consumer Price Index year-over-year % change' },
  { key:'UNEMPLOYMENT_RATE',      label:'US Unemployment',     country:'US', unit:'%',  icon:'👷', desc:'Seasonally adjusted unemployment rate' },
  { key:'REAL_INTEREST_RATE',     label:'US Real Rate',        country:'US', unit:'%',  icon:'🏦', desc:'Real (inflation-adjusted) interest rate' },
  { key:'MANUFACTURING_PMI',      label:'US Mfg PMI',          country:'US', unit:'',   icon:'🏭', desc:'Manufacturing Purchasing Managers Index (>50 = expansion)' },
  { key:'CONSUMER_CONFIDENCE',    label:'Consumer Confidence', country:'US', unit:'',   icon:'🛒', desc:'University of Michigan Consumer Sentiment Index' },
  { key:'GDP_GROWTH_RATE',        label:'UK GDP Growth',       country:'GB', unit:'%',  icon:'🇬🇧', desc:'UK Real GDP quarter-over-quarter growth rate' },
  { key:'INFLATION_CPI_YOY',      label:'UK CPI (YoY)',        country:'GB', unit:'%',  icon:'💷', desc:'UK Consumer Price Index year-over-year' },
  { key:'GDP_GROWTH_RATE',        label:'EU GDP Growth',       country:'DE', unit:'%',  icon:'🇪🇺', desc:'Germany GDP as proxy for EU growth' },
  { key:'GDP_GROWTH_RATE',        label:'China GDP Growth',    country:'CN', unit:'%',  icon:'🇨🇳', desc:'China Real GDP year-over-year growth rate' },
]

const CENTRAL_BANKS = [
  { name:'Federal Reserve', rate:'5.25-5.50%', next:'Jan 29, 2026', stance:'Restrictive', color:'#1B4FFF' },
  { name:'Bank of England', rate:'5.25%',      next:'Feb 6, 2026',  stance:'Restrictive', color:'#059669' },
  { name:'ECB',             rate:'4.50%',      next:'Jan 30, 2026', stance:'Restrictive', color:'#D97706' },
  { name:'Bank of Japan',   rate:'-0.10%',     next:'Jan 23, 2026', stance:'Ultra-loose', color:'#8B5CF6' },
  { name:"People's Bank",   rate:'3.45%',      next:'Feb 20, 2026', stance:'Easing',      color:'#EF4444' },
]

function SparkLine({ data, color = '#1B4FFF' }: { data: any[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export default function MacroPage() {
  const [data, setData]     = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<typeof INDICATORS[0] | null>(null)
  const [detailData, setDetailData] = useState<any[]>([])

  useEffect(() => {
    // Load first 4 indicators upfront
    INDICATORS.slice(0, 6).forEach(ind => loadIndicator(ind))
  }, [])

  async function loadIndicator(ind: typeof INDICATORS[0]) {
    const cacheKey = `${ind.country}_${ind.key}`
    if (data[cacheKey]) return
    setLoading(prev => ({ ...prev, [cacheKey]: true }))
    try {
      const res = await fetch(`/api/macro?country=${ind.country}&indicator=${ind.key}&periods=16`)
      const d   = await res.json()
      setData(prev => ({ ...prev, [cacheKey]: d.history || [] }))
    } catch {}
    setLoading(prev => ({ ...prev, [cacheKey]: false }))
  }

  async function selectIndicator(ind: typeof INDICATORS[0]) {
    setSelected(ind)
    const cacheKey = `${ind.country}_${ind.key}`
    await loadIndicator(ind)
    const history = data[cacheKey] || []
    setDetailData(history.slice(-24).map((d: any) => ({ period: d.date?.slice(0, 7), value: parseFloat(d.value?.toFixed(2)) })))
  }

  function getLatest(ind: typeof INDICATORS[0]) {
    const cacheKey = `${ind.country}_${ind.key}`
    const history  = data[cacheKey]
    if (!history?.length) return null
    const sorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return sorted[0]
  }

  function getTrend(ind: typeof INDICATORS[0]) {
    const cacheKey = `${ind.country}_${ind.key}`
    const history  = data[cacheKey]
    if (!history || history.length < 2) return 'flat'
    const sorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return sorted[0].value > sorted[1].value ? 'up' : 'down'
  }

  function getSparkData(ind: typeof INDICATORS[0]) {
    const cacheKey = `${ind.country}_${ind.key}`
    const history  = data[cacheKey] || []
    return history.slice(-10).map((d: any) => ({ value: d.value }))
  }

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="page-title">Macro Dashboard</h1>
          <p style={{ color: '#7D8FA9', fontSize: 13 }}>Global economic indicators · EODHD live data</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'#059669', animation:'pulse 2s infinite' }} />
          <span style={{ fontSize:12, fontWeight:600, color:'#059669' }}>Live Data</span>
        </div>
      </div>

      {/* Central Banks strip */}
      <div className="card p-4 mb-6">
        <div className="section-title mb-3">Central Bank Rates</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px,1fr))', gap:12 }}>
          {CENTRAL_BANKS.map(cb => (
            <div key={cb.name} style={{ borderLeft:`3px solid ${cb.color}`, paddingLeft:12 }}>
              <div style={{ fontSize:11, color:'#7D8FA9', marginBottom:2 }}>{cb.name}</div>
              <div style={{ fontSize:20, fontWeight:900, color:'#0A1628', letterSpacing:'-0.02em' }}>{cb.rate}</div>
              <div style={{ fontSize:11, marginTop:4, display:'flex', gap:8 }}>
                <span style={{ color:'#7D8FA9' }}>Next: {cb.next}</span>
              </div>
              <span style={{
                fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4, marginTop:4, display:'inline-block',
                background: cb.stance === 'Easing' ? '#DCFCE7' : cb.stance === 'Ultra-loose' ? '#EFF6FF' : '#FEF3C7',
                color:       cb.stance === 'Easing' ? '#059669' : cb.stance === 'Ultra-loose' ? '#1B4FFF' : '#D97706',
              }}>{cb.stance}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Indicators grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:16, marginBottom:32 }}>
        {INDICATORS.map((ind, i) => {
          const cacheKey = `${ind.country}_${ind.key}`
          const latest   = getLatest(ind)
          const trend    = getTrend(ind)
          const spark    = getSparkData(ind)
          const isLoad   = loading[cacheKey]
          return (
            <div
              key={i}
              className="card p-4 hover-lift cursor-pointer"
              style={{ cursor:'pointer' }}
              onClick={() => { loadIndicator(ind); selectIndicator(ind) }}
            >
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:11, color:'#7D8FA9', marginBottom:2 }}>{ind.icon} {ind.label}</div>
                  {isLoad ? (
                    <div className="skeleton" style={{ width:80, height:28, borderRadius:6 }} />
                  ) : latest ? (
                    <div style={{ fontSize:26, fontWeight:900, color:'#0A1628', letterSpacing:'-0.02em' }}>
                      {parseFloat(latest.value?.toFixed(2))}{ind.unit}
                    </div>
                  ) : (
                    <div style={{ fontSize:14, color:'#C5CFDF' }}>Click to load</div>
                  )}
                </div>
                {latest && (
                  <span style={{ fontSize:18 }}>{trend === 'up' ? '↑' : '↓'}</span>
                )}
              </div>
              {spark.length > 0 && (
                <SparkLine
                  data={spark}
                  color={ind.key === 'INFLATION_CPI_YOY' || ind.key === 'UNEMPLOYMENT_RATE' ? '#EF4444' : '#1B4FFF'}
                />
              )}
              {latest && (
                <div style={{ fontSize:11, color:'#7D8FA9', marginTop:4 }}>
                  Period: {latest.date?.slice(0, 7)} · Click for full chart
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="card p-5">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <div>
              <h2 style={{ fontSize:18, fontWeight:800, color:'#0A1628' }}>{selected.icon} {selected.label}</h2>
              <p style={{ fontSize:13, color:'#7D8FA9', marginTop:2 }}>{selected.desc}</p>
            </div>
            <button onClick={() => setSelected(null)} className="btn btn-ghost btn-sm">✕ Close</button>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={detailData.length ? detailData : getSparkData(selected).map((d,i)=>({period:String(i),value:d.value}))}>
              <defs>
                <linearGradient id="macroGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#1B4FFF" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#1B4FFF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF5" />
              <XAxis dataKey="period" tick={{ fontSize:11, fill:'#7D8FA9' }} />
              <YAxis tick={{ fontSize:11, fill:'#7D8FA9' }} />
              <Tooltip
                contentStyle={{ background:'#fff', border:'1px solid #E8EDF5', borderRadius:8, fontSize:12 }}
                formatter={(v: any) => [`${parseFloat(v).toFixed(2)}${selected.unit}`, selected.label]}
              />
              {selected.key === 'MANUFACTURING_PMI' && <ReferenceLine y={50} stroke="#D97706" strokeDasharray="4 4" label={{ value:'50 = expansion', fill:'#D97706', fontSize:10 }} />}
              <Area type="monotone" dataKey="value" stroke="#1B4FFF" strokeWidth={2} fill="url(#macroGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

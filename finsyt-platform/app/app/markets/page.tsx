'use client'
import { useState, useEffect } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const INDICES = [
  { label:'S&P 500',        symbol:'GSPC.INDX',  region:'US' },
  { label:'NASDAQ 100',     symbol:'NDX.INDX',   region:'US' },
  { label:'Dow Jones',      symbol:'DJI.INDX',   region:'US' },
  { label:'FTSE 100',       symbol:'FTSE.INDX',  region:'UK' },
  { label:'EURO STOXX 50',  symbol:'STOXX50E.INDX', region:'EU' },
  { label:'Nikkei 225',     symbol:'N225.INDX',  region:'JP' },
  { label:'DAX',            symbol:'GDAXI.INDX', region:'DE' },
  { label:'Hang Seng',      symbol:'HSI.INDX',   region:'HK' },
]

const FOREX = [
  { pair:'EUR/USD', symbol:'EURUSD.FOREX' },
  { pair:'GBP/USD', symbol:'GBPUSD.FOREX' },
  { pair:'USD/JPY', symbol:'USDJPY.FOREX' },
  { pair:'USD/CHF', symbol:'USDCHF.FOREX' },
  { pair:'AUD/USD', symbol:'AUDUSD.FOREX' },
  { pair:'USD/CAD', symbol:'USDCAD.FOREX' },
]

const COMMODITIES = [
  { label:'Gold',       symbol:'XAUUSD.FOREX' },
  { label:'Silver',     symbol:'XAGUSD.FOREX' },
  { label:'WTI Crude',  symbol:'CL.COMM'      },
  { label:'Brent',      symbol:'BZ.COMM'      },
  { label:'Natural Gas',symbol:'NG.COMM'      },
  { label:'Copper',     symbol:'HG.COMM'      },
]

const SECTORS_STATIC = [
  { name:'Technology',       change: 1.42, ytd: 8.3,  icon:'💻' },
  { name:'Healthcare',       change: 0.31, ytd: 3.1,  icon:'🏥' },
  { name:'Financials',       change:-0.12, ytd: 5.2,  icon:'🏦' },
  { name:'Energy',           change:-0.82, ytd:-2.1,  icon:'⚡' },
  { name:'Consumer Disc.',   change: 0.64, ytd: 4.8,  icon:'🛍️' },
  { name:'Consumer Staples', change: 0.18, ytd: 1.2,  icon:'🛒' },
  { name:'Industrials',      change: 0.22, ytd: 2.8,  icon:'🏭' },
  { name:'Utilities',        change:-0.45, ytd:-0.8,  icon:'💡' },
  { name:'Real Estate',      change:-0.67, ytd:-3.2,  icon:'🏢' },
  { name:'Materials',        change: 0.35, ytd: 1.9,  icon:'⛏️' },
  { name:'Communication',    change: 0.91, ytd: 6.1,  icon:'📡' },
]

function PctBadge({ v }: { v: number }) {
  const pos = v >= 0
  return (
    <span style={{
      fontSize:12, fontWeight:700, padding:'2px 7px', borderRadius:6,
      background: pos ? '#DCFCE7' : '#FEE2E2',
      color:       pos ? '#059669' : '#EF4444',
    }}>
      {pos ? '+' : ''}{v?.toFixed(2)}%
    </span>
  )
}

function QuoteRow({ label, symbol, region }: { label: string; symbol: string; region?: string }) {
  const [q, setQ] = useState<any>(null)

  useEffect(() => {
    fetch(`/api/quote?symbol=${symbol}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setQ(d) })
      .catch(() => {})
  }, [symbol])

  return (
    <tr>
      <td>
        <div style={{ fontWeight:600, fontSize:13, color:'#0A1628' }}>{label}</div>
        {region && <div style={{ fontSize:11, color:'#C5CFDF' }}>{symbol.split('.')[0]}</div>}
      </td>
      <td className="right" style={{ fontWeight:700, fontSize:14 }}>
        {q ? (q.price ? `${Number(q.price).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})}` : '—') : <span className="skeleton inline-block w-16 h-4" />}
      </td>
      <td className="right">
        {q ? <PctBadge v={q.changePct ?? q.change_p} /> : <span className="skeleton inline-block w-12 h-4" />}
      </td>
    </tr>
  )
}

export default function MarketsPage() {
  const [tab, setTab] = useState<'indices'|'forex'|'commodities'|'sectors'>('indices')
  const [heatData] = useState(SECTORS_STATIC)

  return (
    <div className="page-content">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title">Markets</h1>
          <p style={{ fontSize:13, color:'#7D8FA9' }}>Global indices, FX, commodities & sector performance</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'#059669', animation:'pulse 2s infinite' }} />
          <span style={{ fontSize:12, fontWeight:600, color:'#059669' }}>Live Data</span>
        </div>
      </div>

      <div className="tab-bar" style={{ marginBottom:20 }}>
        {[['indices','Indices'],['forex','Forex'],['commodities','Commodities'],['sectors','Sector Heat Map']].map(([v,l]) => (
          <button key={v} className={`tab-btn ${tab===v?'active':''}`} onClick={() => setTab(v as any)}>{l}</button>
        ))}
      </div>

      {tab === 'indices' && (
        <div className="card overflow-hidden">
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #E8EDF5', fontWeight:700, color:'#0A1628', fontSize:13 }}>
            Global Equity Indices — Live
          </div>
          <table className="data-table">
            <thead><tr><th>Index</th><th className="right">Price</th><th className="right">Change</th></tr></thead>
            <tbody>
              {INDICES.map(idx => <QuoteRow key={idx.symbol} label={idx.label} symbol={idx.symbol} region={idx.region} />)}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'forex' && (
        <div className="card overflow-hidden">
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #E8EDF5', fontWeight:700, color:'#0A1628', fontSize:13 }}>
            FX Rates — Live
          </div>
          <table className="data-table">
            <thead><tr><th>Pair</th><th className="right">Rate</th><th className="right">Change</th></tr></thead>
            <tbody>
              {FOREX.map(f => <QuoteRow key={f.symbol} label={f.pair} symbol={f.symbol} />)}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'commodities' && (
        <div className="card overflow-hidden">
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #E8EDF5', fontWeight:700, color:'#0A1628', fontSize:13 }}>
            Commodities — Live
          </div>
          <table className="data-table">
            <thead><tr><th>Commodity</th><th className="right">Price</th><th className="right">Change</th></tr></thead>
            <tbody>
              {COMMODITIES.map(c => <QuoteRow key={c.symbol} label={c.label} symbol={c.symbol} />)}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sectors' && (
        <div>
          <div className="section-title mb-4">S&P 500 Sector Performance</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:12 }}>
            {heatData.sort((a,b)=>b.change-a.change).map(s => {
              const intensity = Math.min(Math.abs(s.change) / 2, 1)
              const bg = s.change >= 0
                ? `rgba(5,150,105,${0.08 + intensity * 0.25})`
                : `rgba(239,68,68,${0.08 + intensity * 0.25})`
              const border = s.change >= 0 ? '#059669' : '#EF4444'
              return (
                <div key={s.name} style={{ background:bg, borderLeft:`3px solid ${border}`, borderRadius:10, padding:'14px 16px' }}>
                  <div style={{ fontSize:18, marginBottom:4 }}>{s.icon}</div>
                  <div style={{ fontWeight:700, fontSize:13, color:'#0A1628', marginBottom:6 }}>{s.name}</div>
                  <div style={{ display:'flex', gap:8 }}>
                    <PctBadge v={s.change} />
                    <span style={{ fontSize:11, color:'#7D8FA9', alignSelf:'center' }}>YTD: {s.ytd > 0 ? '+' : ''}{s.ytd}%</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="card p-5 mt-6">
            <div className="section-title mb-4">Today vs YTD — All Sectors</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={heatData} margin={{ top:0, right:0, bottom:0, left:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF5" />
                <XAxis dataKey="name" tick={{ fontSize:10, fill:'#7D8FA9' }} tickFormatter={n=>n.split(' ')[0]} />
                <YAxis tick={{ fontSize:11, fill:'#7D8FA9' }} tickFormatter={v=>`${v}%`} />
                <Tooltip formatter={(v:any)=>[`${v>0?'+':''}${Number(v).toFixed(2)}%`]} contentStyle={{ fontSize:12 }} />
                <Bar dataKey="change" name="Today" radius={[4,4,0,0]}
                  fill="#1B4FFF"
                  label={false}
                  // colour each bar individually
                  isAnimationActive={true}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

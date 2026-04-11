'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const WATCHLIST_DEFAULT = ['AAPL','MSFT','NVDA','TSLA','META']

const NEWS_STATIC = [
  { headline:'Fed signals two rate cuts in 2026 amid easing inflation', source:'Reuters', time:'2h ago', sentiment:'neutral', tag:'Macro' },
  { headline:'NVIDIA Blackwell GPU demand outpaces supply through Q2 2026', source:'Bloomberg', time:'3h ago', sentiment:'positive', tag:'NVDA' },
  { headline:'Apple Intelligence features drive record iPhone upgrade cycle', source:'FT', time:'5h ago', sentiment:'positive', tag:'AAPL' },
  { headline:'Tesla faces margin pressure as EV competition intensifies in China', source:'WSJ', time:'7h ago', sentiment:'negative', tag:'TSLA' },
  { headline:'Microsoft Azure re-accelerates to +35% growth in Q3 FY2026', source:'CNBC', time:'8h ago', sentiment:'positive', tag:'MSFT' },
]

const MACRO_STRIP = [
  { label:'S&P 500',      value:'5,254',  change:'+0.42%', up:true },
  { label:'NASDAQ',       value:'18,391', change:'+0.61%', up:true },
  { label:'10Y Yield',    value:'4.38%',  change:'-2bp',   up:false },
  { label:'DXY',          value:'104.2',  change:'-0.3%',  up:false },
  { label:'Gold',         value:'$2,374', change:'+0.8%',  up:true },
  { label:'BTC',          value:'$84,200',change:'+1.2%',  up:true },
  { label:'VIX',          value:'14.8',   change:'-0.6',   up:false },
  { label:'WTI',          value:'$71.4',  change:'-0.5%',  up:false },
]

const EARNINGS_UPCOMING = [
  { symbol:'MSFT', name:'Microsoft',       date:'Apr 30',   est:'$3.41',  surprise:'est.' },
  { symbol:'AAPL', name:'Apple',           date:'May 1',    est:'$1.62',  surprise:'est.' },
  { symbol:'AMZN', name:'Amazon',          date:'May 1',    est:'$1.36',  surprise:'est.' },
  { symbol:'GOOGL', name:'Alphabet',       date:'Apr 29',   est:'$2.11',  surprise:'est.' },
  { symbol:'META', name:'Meta Platforms',  date:'Apr 30',   est:'$5.28',  surprise:'est.' },
]

const MOVERS = {
  gainers:[
    { symbol:'NVDA', change:2.88, price:'$924.80' },
    { symbol:'AMD',  change:2.14, price:'$158.40' },
    { symbol:'NFLX', change:1.87, price:'$890.40' },
    { symbol:'AVGO', change:1.41, price:'$218.50' },
    { symbol:'CRM',  change:1.22, price:'$298.20' },
  ],
  losers:[
    { symbol:'INTC', change:-2.31, price:'$32.40' },
    { symbol:'XOM',  change:-0.84, price:'$116.40' },
    { symbol:'NEE',  change:-0.72, price:'$64.20' },
    { symbol:'AMT',  change:-0.68, price:'$184.30' },
    { symbol:'BA',   change:-0.55, price:'$168.10' },
  ]
}

// Mock sparkline data for watchlist
function mockSpark(up: boolean) {
  let v = 100
  return Array.from({length:20}, (_,i) => {
    v += (Math.random()-0.45)*(up?1:-1)*3
    return { t:i, v: Math.round(v*100)/100 }
  })
}

function SentimentDot({ s }: { s: string }) {
  const map: Record<string,string> = { positive:'#059669', negative:'#EF4444', neutral:'#D97706' }
  return <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%', background:map[s]||'#C5CFDF', marginRight:5 }} />
}

export default function Dashboard() {
  const [quotes, setQuotes]   = useState<Record<string,any>>({})
  const [loading, setLoading] = useState(true)
  const [moverTab, setMoverTab] = useState<'gainers'|'losers'>('gainers')
  const [news, setNews]         = useState(NEWS_STATIC)

  useEffect(() => {
    async function loadQuotes() {
      const results: Record<string,any> = {}
      for (const sym of WATCHLIST_DEFAULT.slice(0,5)) {
        try {
          const r = await fetch(`/api/quote?symbol=${sym}`)
          const d = await r.json()
          if (!d.error) results[sym] = d
        } catch {}
        await new Promise(r=>setTimeout(r,300))
      }
      setQuotes(results)
      setLoading(false)
    }
    loadQuotes()

    // Try to load live news
    fetch('/api/news?limit=5')
      .then(r=>r.json())
      .then(d => { if (d?.articles?.length) setNews(d.articles.slice(0,5).map((a:any)=>({ headline:a.title, source:a.source, time:a.date?.slice(0,10), sentiment:a.sentiment?.polarity||'neutral', tag:'' }))) })
      .catch(()=>{})
  }, [])

  const sparkData = WATCHLIST_DEFAULT.reduce((acc,sym,i) => {
    acc[sym] = mockSpark(i%2===0)
    return acc
  }, {} as Record<string,any[]>)

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p style={{ fontSize:13, color:'#7D8FA9' }}>
            {new Date().toLocaleDateString('en-GB',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} · Markets {new Date().getHours()<21&&new Date().getHours()>13?'Open':'Closed'}
          </p>
        </div>
        <Link href="/app/research" className="btn btn-primary">🧠 Open AI Analyst</Link>
      </div>

      {/* Macro strip */}
      <div style={{ overflowX:'auto', marginBottom:20 }}>
        <div style={{ display:'flex', gap:8, minWidth:'max-content' }}>
          {MACRO_STRIP.map(m => (
            <div key={m.label} style={{ background:'#fff', border:'1px solid #E8EDF5', borderRadius:10, padding:'10px 14px', minWidth:110 }}>
              <div style={{ fontSize:11, color:'#7D8FA9', marginBottom:3 }}>{m.label}</div>
              <div style={{ fontSize:15, fontWeight:800, color:'#0A1628', letterSpacing:'-0.02em' }}>{m.value}</div>
              <div style={{ fontSize:11, fontWeight:700, color: m.up?'#059669':'#EF4444', marginTop:2 }}>{m.change}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20, marginBottom:20 }}>

        {/* Watchlist */}
        <div className="card" style={{ gridColumn:'span 2' }}>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8EDF5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:700, color:'#0A1628', fontSize:14 }}>My Watchlist</span>
            <Link href="/app/watchlist" style={{ fontSize:12, color:'#1B4FFF', fontWeight:600 }}>Manage →</Link>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="data-table">
              <thead><tr><th>Ticker</th><th className="right">Price</th><th className="right">Change</th><th className="right">Mkt Cap</th><th style={{width:100}}>7D</th></tr></thead>
              <tbody>
                {WATCHLIST_DEFAULT.map(sym => {
                  const q = quotes[sym]
                  const up = q ? (q.changePct ?? 0) >= 0 : true
                  return (
                    <tr key={sym} style={{ cursor:'pointer' }} onClick={() => window.location.href=`/app/company/${sym}`}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:12 }}>
                            {sym[0]}
                          </div>
                          <div>
                            <div style={{ fontWeight:700, fontSize:13, color:'#0A1628' }}>{sym}</div>
                            {q && <div style={{ fontSize:11, color:'#7D8FA9' }}>{q.name?.slice(0,18)}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="right" style={{ fontWeight:700, fontSize:13 }}>
                        {loading ? <span className="skeleton inline-block w-14 h-4" /> : q ? `$${Number(q.price).toFixed(2)}` : '—'}
                      </td>
                      <td className="right">
                        {q ? (
                          <span style={{ fontSize:12, fontWeight:700, padding:'2px 7px', borderRadius:6,
                            background: up?'#DCFCE7':'#FEE2E2', color:up?'#059669':'#EF4444' }}>
                            {up?'+':''}{Number(q.changePct??0).toFixed(2)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="right" style={{ fontSize:12, color:'#3D4F6E' }}>
                        {q?.marketCap ? `$${(q.marketCap/1e12).toFixed(2)}T` : '—'}
                      </td>
                      <td style={{ padding:'4px 8px' }}>
                        <ResponsiveContainer width="100%" height={36}>
                          <AreaChart data={sparkData[sym]} margin={{top:2,right:2,bottom:2,left:2}}>
                            <defs>
                              <linearGradient id={`sg${sym}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor={up?'#059669':'#EF4444'} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={up?'#059669':'#EF4444'} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="v" stroke={up?'#059669':'#EF4444'} strokeWidth={1.5} fill={`url(#sg${sym})`} dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Movers */}
        <div className="card">
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8EDF5' }}>
            <div className="tab-bar" style={{ margin:0, gap:4 }}>
              {(['gainers','losers'] as const).map(t=>(
                <button key={t} className={`tab-btn ${moverTab===t?'active':''}`} style={{ fontSize:11, padding:'4px 10px' }} onClick={()=>setMoverTab(t)}>
                  {t==='gainers'?'🔼 Gainers':'🔽 Losers'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding:'8px 0' }}>
            {MOVERS[moverTab].map(m=>(
              <Link key={m.symbol} href={`/app/company/${m.symbol}`}
                style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 16px', textDecoration:'none' }}
                className="hover:bg-gray-50">
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:28, height:28, borderRadius:6, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:11 }}>
                    {m.symbol[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:12, color:'#0A1628' }}>{m.symbol}</div>
                    <div style={{ fontSize:11, color:'#7D8FA9' }}>{m.price}</div>
                  </div>
                </div>
                <span style={{ fontSize:13, fontWeight:800, color:m.change>0?'#059669':'#EF4444' }}>
                  {m.change>0?'+':''}{m.change}%
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom grid: News + Earnings */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

        {/* News */}
        <div className="card">
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8EDF5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:700, color:'#0A1628', fontSize:14 }}>Market News</span>
            <Link href="/app/news" style={{ fontSize:12, color:'#1B4FFF', fontWeight:600 }}>All news →</Link>
          </div>
          <div>
            {news.map((n,i)=>(
              <div key={i} style={{ padding:'12px 16px', borderBottom: i<news.length-1?'1px solid #F1F5F9':'' }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#0A1628', lineHeight:1.4, marginBottom:4 }}>
                  <SentimentDot s={String(n.sentiment ?? "neutral")} />
                  {n.headline}
                </div>
                <div style={{ fontSize:11, color:'#9CA3AF', display:'flex', gap:8 }}>
                  <span>{n.source}</span>
                  <span>·</span>
                  <span>{n.time}</span>
                  {n.tag && <><span>·</span><span style={{ color:'#1B4FFF', fontWeight:600 }}>{n.tag}</span></>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Earnings Calendar */}
        <div className="card">
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8EDF5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:700, color:'#0A1628', fontSize:14 }}>Upcoming Earnings</span>
            <span style={{ fontSize:12, color:'#7D8FA9' }}>Next 14 days</span>
          </div>
          <div>
            {EARNINGS_UPCOMING.map((e,i)=>(
              <Link key={e.symbol} href={`/app/company/${e.symbol}`}
                style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px',
                  borderBottom:i<EARNINGS_UPCOMING.length-1?'1px solid #F1F5F9':'', textDecoration:'none' }}
                className="hover:bg-gray-50">
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:12 }}>
                    {e.symbol[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:'#0A1628' }}>{e.symbol}</div>
                    <div style={{ fontSize:11, color:'#7D8FA9' }}>{e.name}</div>
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#0A1628' }}>{e.date}</div>
                  <div style={{ fontSize:11, color:'#7D8FA9' }}>EPS est. {e.est}</div>
                </div>
              </Link>
            ))}
          </div>
          <div style={{ padding:'12px 16px', borderTop:'1px solid #E8EDF5' }}>
            <Link href="/app/screener" style={{ fontSize:12, color:'#1B4FFF', fontWeight:600 }}>View full earnings calendar →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

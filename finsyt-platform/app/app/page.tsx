'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { usePolling } from '@/lib/hooks'
import { isMarketOpen, marketStatusLabel } from '@/lib/market-hours'

const WATCHLIST_DEFAULT = ['AAPL','MSFT','NVDA','TSLA','META']

const MACRO_PROXIES: Record<string,string> = {
  'S&P 500': 'SPY',
  'NASDAQ':  'QQQ',
  'Dow':     'DIA',
  'Russell': 'IWM',
  'Gold':    'GLD',
  'Oil':     'USO',
  'BTC':     'IBIT',
  'VIX':     'VIXY',
}

const MOVER_SYMBOLS = ['NVDA','AMD','NFLX','AVGO','CRM','INTC','XOM','NEE','AMT','BA']

const NEWS_STATIC = [
  { headline:'Fed signals two rate cuts in 2026 amid easing inflation', source:'Reuters', time:'2h ago', sentiment:'neutral', tag:'Macro' },
  { headline:'NVIDIA Blackwell GPU demand outpaces supply through Q2 2026', source:'Bloomberg', time:'3h ago', sentiment:'positive', tag:'NVDA' },
  { headline:'Apple Intelligence features drive record iPhone upgrade cycle', source:'FT', time:'5h ago', sentiment:'positive', tag:'AAPL' },
  { headline:'Tesla faces margin pressure as EV competition intensifies in China', source:'WSJ', time:'7h ago', sentiment:'negative', tag:'TSLA' },
  { headline:'Microsoft Azure re-accelerates to +35% growth in Q3 FY2026', source:'CNBC', time:'8h ago', sentiment:'positive', tag:'MSFT' },
]

const EARNINGS_UPCOMING = [
  { symbol:'MSFT', name:'Microsoft',       date:'Apr 30',   est:'$3.41',  surprise:'est.' },
  { symbol:'AAPL', name:'Apple',           date:'May 1',    est:'$1.62',  surprise:'est.' },
  { symbol:'AMZN', name:'Amazon',          date:'May 1',    est:'$1.36',  surprise:'est.' },
  { symbol:'GOOGL', name:'Alphabet',       date:'Apr 29',   est:'$2.11',  surprise:'est.' },
  { symbol:'META', name:'Meta Platforms',   date:'Apr 30',   est:'$5.28',  surprise:'est.' },
]

const MACRO_FALLBACK = [
  { label:'S&P 500', value:'5,254',  change:'+0.42%', up:true },
  { label:'NASDAQ',  value:'18,391', change:'+0.61%', up:true },
  { label:'Dow',     value:'39,150', change:'+0.18%', up:true },
  { label:'Russell', value:'2,048',  change:'-0.3%',  up:false },
  { label:'Gold',    value:'$2,374', change:'+0.8%',  up:true },
  { label:'Oil',     value:'$71.4',  change:'-0.5%',  up:false },
  { label:'BTC',     value:'$84,200',change:'+1.2%',  up:true },
  { label:'VIX',     value:'14.8',   change:'-0.6',   up:false },
]

const MOVERS_FALLBACK = {
  gainers: [
    { symbol:'NVDA', change:2.88, price:'$924.80' },
    { symbol:'AMD',  change:2.14, price:'$158.40' },
    { symbol:'NFLX', change:1.87, price:'$890.40' },
    { symbol:'AVGO', change:1.41, price:'$218.50' },
    { symbol:'CRM',  change:1.22, price:'$298.20' },
  ],
  losers: [
    { symbol:'INTC', change:-2.31, price:'$32.40' },
    { symbol:'XOM',  change:-0.84, price:'$116.40' },
    { symbol:'NEE',  change:-0.72, price:'$64.20' },
    { symbol:'AMT',  change:-0.68, price:'$184.30' },
    { symbol:'BA',   change:-0.55, price:'$168.10' },
  ],
}

type Quote = Record<string, unknown>

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

function MarketBadge() {
  const label = marketStatusLabel()
  const color = label === 'LIVE' ? '#059669' : '#D97706'
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:color, display:'inline-block',
        animation: label === 'LIVE' ? 'pulse 2s infinite' : 'none' }} />
      {label}
    </span>
  )
}

async function fetchQuote(sym: string): Promise<Quote | null> {
  try {
    const r = await fetch(`/api/quote?symbol=${sym}`)
    const d = await r.json()
    return d.error ? null : d
  } catch { return null }
}

export default function Dashboard() {
  const [quotes, setQuotes]     = useState<Record<string, Quote>>({})
  const [macroData, setMacro]   = useState(MACRO_FALLBACK)
  const [movers, setMovers]     = useState(MOVERS_FALLBACK)
  const [loading, setLoading]   = useState(true)
  const [moverTab, setMoverTab] = useState<'gainers'|'losers'>('gainers')
  const [news, setNews]         = useState(NEWS_STATIC)
  const [dataLive, setDataLive] = useState(false)

  const loadAllQuotes = useCallback(async () => {
    const allSymbols = [...new Set([
      ...WATCHLIST_DEFAULT,
      ...Object.values(MACRO_PROXIES),
      ...MOVER_SYMBOLS,
    ])]

    const results: Record<string, Quote> = {}
    const batchSize = 4
    for (let i = 0; i < allSymbols.length; i += batchSize) {
      const batch = allSymbols.slice(i, i + batchSize)
      const fetched = await Promise.all(batch.map(fetchQuote))
      batch.forEach((sym, idx) => {
        if (fetched[idx]) results[sym] = fetched[idx]!
      })
    }

    if (Object.keys(results).length > 0) {
      setQuotes(results)
      setDataLive(true)

      const newMacro = Object.entries(MACRO_PROXIES).map(([label, sym]) => {
        const q = results[sym]
        if (!q) {
          const fb = MACRO_FALLBACK.find(m => m.label === label)
          return fb || { label, value: '—', change: '—', up: true }
        }
        const price = Number(q.price)
        const pct = Number(q.changePct ?? 0)
        return {
          label,
          value: price >= 1000 ? price.toLocaleString('en-US', { maximumFractionDigits: 0 })
               : price >= 10 ? price.toFixed(1)
               : `$${price.toFixed(2)}`,
          change: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
          up: pct >= 0,
        }
      })
      setMacro(newMacro)

      const moverQuotes = MOVER_SYMBOLS
        .map(sym => results[sym] ? { symbol: sym, change: Number((results[sym] as Quote).changePct ?? 0), price: `$${Number((results[sym] as Quote).price).toFixed(2)}` } : null)
        .filter(Boolean) as { symbol: string; change: number; price: string }[]

      const sorted = [...moverQuotes].sort((a, b) => b.change - a.change)
      if (sorted.length > 0) {
        setMovers({
          gainers: sorted.filter(m => m.change >= 0).slice(0, 5),
          losers: sorted.filter(m => m.change < 0).sort((a, b) => a.change - b.change).slice(0, 5),
        })
      }
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadAllQuotes()

    fetch('/api/news?limit=5')
      .then(r => r.json())
      .then(d => {
        if (d?.articles?.length) setNews(d.articles.slice(0,5).map((a: Record<string, unknown>) => ({
          headline: a.title as string,
          source: a.source as string,
          time: (a.date as string)?.slice(0,10),
          sentiment: (a.sentiment as Record<string,string>)?.polarity || 'neutral',
          tag: '',
        })))
      })
      .catch(() => {})
  }, [loadAllQuotes])

  usePolling(loadAllQuotes, 30_000, isMarketOpen())

  const sparkData = WATCHLIST_DEFAULT.reduce((acc, sym, i) => {
    acc[sym] = mockSpark(i % 2 === 0)
    return acc
  }, {} as Record<string, { t: number; v: number }[]>)

  return (
    <div className="page-content">
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            Dashboard
            <MarketBadge />
          </h1>
          <p style={{ fontSize:13, color:'#7D8FA9' }}>
            {new Date().toLocaleDateString('en-GB',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} · Markets {isMarketOpen() ? 'Open' : 'Closed'}
            {dataLive && <span style={{ marginLeft:8, fontSize:11, color:'#059669', fontWeight:600 }}>· Data from API</span>}
          </p>
        </div>
        <Link href="/app/research" className="btn btn-primary">🧠 Open AI Analyst</Link>
      </div>

      {/* Macro strip */}
      <div style={{ overflowX:'auto', marginBottom:20 }}>
        <div style={{ display:'flex', gap:8, minWidth:'max-content' }}>
          {macroData.map(m => (
            <div key={m.label} style={{ background:'#fff', border:'1px solid #E8EDF5', borderRadius:10, padding:'10px 14px', minWidth:110 }}>
              <div style={{ fontSize:11, color:'#7D8FA9', marginBottom:3 }}>{m.label}</div>
              <div style={{ fontSize:15, fontWeight:800, color:'#0A1628', letterSpacing:'-0.02em' }}>{m.value}</div>
              <div style={{ fontSize:11, fontWeight:700, color: m.up ? '#059669' : '#EF4444', marginTop:2 }}>{m.change}</div>
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
                  const up = q ? (Number(q.changePct) ?? 0) >= 0 : true
                  return (
                    <tr key={sym} style={{ cursor:'pointer' }} onClick={() => window.location.href=`/app/company/${sym}`}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:12 }}>
                            {sym[0]}
                          </div>
                          <div>
                            <div style={{ fontWeight:700, fontSize:13, color:'#0A1628' }}>{sym}</div>
                            {q && <div style={{ fontSize:11, color:'#7D8FA9' }}>{(q.name as string)?.slice(0,18)}</div>}
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
                        {q?.marketCap ? `$${(Number(q.marketCap)/1e12).toFixed(2)}T` : '—'}
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
            {movers[moverTab].map(m=>(
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
                  {m.change>0?'+':''}{m.change.toFixed(2)}%
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

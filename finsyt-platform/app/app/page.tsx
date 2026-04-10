'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fmtLarge, fmtPct, fmt, changeClass } from '@/lib/utils'

const INDICES = [
  { label: 'S&P 500', change: 0.42, price: 5254.35 },
  { label: 'NASDAQ', change: 0.61, price: 18391.2 },
  { label: 'Dow Jones', change: 0.22, price: 39127.8 },
  { label: 'VIX', change: -1.8, price: 14.21 },
  { label: 'EUR/USD', change: 0.08, price: 1.0841 },
  { label: '10Y Yield', change: 2.1, price: 4.38 },
]

const STATIC: any[] = [
  { symbol:'AAPL', name:'Apple Inc.', price:189.3, change:2.27, changePct:1.21, marketCap:3.1e12, pe:33.02, volume:28000000 },
  { symbol:'MSFT', name:'Microsoft Corp.', price:415.2, change:-1.7, changePct:-0.41, marketCap:3.1e12, pe:34.1, volume:14000000 },
  { symbol:'NVDA', name:'NVIDIA Corp.', price:924.8, change:25.9, changePct:2.88, marketCap:2.28e12, pe:52.3, volume:42000000 },
  { symbol:'GOOGL', name:'Alphabet Inc.', price:178.5, change:1.1, changePct:0.62, marketCap:2.21e12, pe:21.8, volume:18000000 },
  { symbol:'META', name:'Meta Platforms', price:529.3, change:4.8, changePct:0.92, marketCap:1.34e12, pe:27.1, volume:12000000 },
]

export default function AppOverview() {
  const [quotes, setQuotes] = useState<any[]>(STATIC)
  const [news, setNews] = useState<any[]>([])
  const [loadingNews, setLoadingNews] = useState(true)

  useEffect(() => {
    async function fetchLiveQuotes() {
      try {
        const res = await fetch('/api/quote?symbol=AAPL')
        const d = await res.json()
        if (!d.error) setQuotes(prev => prev.map(q => q.symbol === 'AAPL' ? { ...q, ...d } : q))
      } catch {}
    }
    async function fetchNews() {
      try {
        const res = await fetch('/api/news?topics=financial_markets&limit=8')
        const d = await res.json()
        setNews(d.articles || [])
      } catch {}
      setLoadingNews(false)
    }
    fetchLiveQuotes()
    fetchNews()
  }, [])

  const sentimentColor = (s: string) => {
    if (!s) return '#7D8FA9'
    if (s.includes('Bullish')) return '#059669'
    if (s.includes('Bearish')) return '#DC2626'
    return '#D97706'
  }

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Market Overview</h1>
          <p className="text-sm mt-0.5" style={{ color: '#7D8FA9' }}>
            {new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })} · Live
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/research" className="btn btn-primary btn-sm">◎ AI Research</Link>
          <Link href="/app/screener" className="btn btn-outline btn-sm">▤ Screener</Link>
        </div>
      </div>

      {/* Indices */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {INDICES.map(idx => (
          <div key={idx.label} className="metric-card py-3 px-4">
            <div className="label mb-1">{idx.label}</div>
            <div className="font-bold text-sm">{idx.price.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
            <div className={`text-xs font-semibold ${changeClass(idx.change)}`}>{fmtPct(idx.change)}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Watchlist */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4" style={{borderBottom:'1px solid #E2E8F2'}}>
              <span className="section-title" style={{margin:0}}>Watchlist</span>
              <Link href="/app/watchlist" className="btn btn-ghost btn-sm">Manage →</Link>
            </div>
            <div style={{overflowX:'auto'}}>
              <table className="data-table">
                <thead><tr><th>Company</th><th className="right">Price</th><th className="right">Change</th><th className="right">Mkt Cap</th><th className="right">P/E</th><th></th></tr></thead>
                <tbody>
                  {quotes.map(q => (
                    <tr key={q.symbol} style={{cursor:'pointer'}} onClick={() => window.location.href=`/app/company/${q.symbol}`}>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:12}}>
                          <div style={{width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:900,flexShrink:0}}>{q.symbol[0]}</div>
                          <div>
                            <div style={{fontWeight:700,fontSize:13,color:'#0A1628'}}>{q.symbol}</div>
                            <div style={{fontSize:12,color:'#7D8FA9'}}>{q.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="right" style={{fontWeight:700,fontSize:13}}>${fmt(q.price)}</td>
                      <td className={`right ${changeClass(q.changePct)}`} style={{fontSize:13}}>{fmtPct(q.changePct)}</td>
                      <td className="right" style={{fontSize:13,color:'#3D4F6E'}}>{fmtLarge(q.marketCap)}</td>
                      <td className="right" style={{fontSize:13,color:'#3D4F6E'}}>{q.pe>0?`${fmt(q.pe)}x`:'—'}</td>
                      <td><Link href={`/app/company/${q.symbol}`} className="btn btn-ghost btn-sm" onClick={e=>e.stopPropagation()}>View →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              {label:'AI Signals Today',value:'47',sub:'+12 vs yesterday',color:'#1B4FFF'},
              {label:'Earnings This Week',value:'18',sub:'3 beat today',color:'#059669'},
              {label:'Watchlist Alerts',value:'3',sub:'New movements',color:'#D97706'},
            ].map(m => (
              <div key={m.label} className="metric-card">
                <div className="label mb-2">{m.label}</div>
                <div style={{fontWeight:900,fontSize:'1.5rem',color:m.color,letterSpacing:'-0.02em'}}>{m.value}</div>
                <div style={{fontSize:12,color:'#7D8FA9',marginTop:4}}>{m.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* News */}
        <div className="card overflow-hidden flex flex-col" style={{maxHeight:560}}>
          <div className="flex items-center justify-between px-5 py-4" style={{borderBottom:'1px solid #E2E8F2'}}>
            <span className="section-title" style={{margin:0}}>Market News</span>
            <Link href="/app/news" className="btn btn-ghost btn-sm" style={{fontSize:12}}>All →</Link>
          </div>
          <div style={{overflowY:'auto',flex:1}}>
            {loadingNews ? [...Array(6)].map((_,i) => (
              <div key={i} style={{padding:'1rem 1.25rem',borderBottom:'1px solid #F0F4FA'}}>
                <div className="skeleton" style={{height:12,width:'75%',marginBottom:8}} />
                <div className="skeleton" style={{height:12,width:'50%'}} />
              </div>
            )) : news.slice(0,8).map((n,i) => (
              <a key={i} href={n.url} target="_blank" rel="noopener noreferrer"
                style={{display:'block',padding:'0.875rem 1.25rem',borderBottom:'1px solid #F0F4FA',textDecoration:'none'}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:4}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:sentimentColor(n.sentiment),flexShrink:0,marginTop:5}} />
                  <p style={{fontSize:12,fontWeight:600,color:'#1C2B4A',lineHeight:1.4,margin:0}}>{n.title}</p>
                </div>
                <div style={{marginLeft:14,display:'flex',gap:8,fontSize:11,color:'#B0BCD0'}}>
                  <span>{n.source}</span>
                  <span style={{color:sentimentColor(n.sentiment),fontWeight:600}}>{n.sentiment?.replace('_',' ')}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

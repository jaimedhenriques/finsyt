'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { fmtLarge, fmtPct, fmt, changeClass } from '@/lib/utils'

const MINI_INDICES = [
  { label:'.NDX', name:'NASDAQ 100', price:18391.2, change:0.61, sparkData:[170,172,168,175,173,178,180,176,181,184] },
  { label:'.SPX', name:'S&P 500', price:5254.35, change:0.42, sparkData:[49,50,48,51,50,52,53,51,52,54] },
  { label:'.FTSE', name:'FTSE 100', price:8204.6, change:0.14, sparkData:[80,81,79,82,81,83,82,84,83,85] },
  { label:'.DJI', name:'Dow Jones', price:39127.8, change:0.22, sparkData:[380,382,379,385,383,388,386,390,389,391] },
]

const WATCHLIST_STATIC: any[] = [
  { symbol:'AAPL', name:'Apple Inc.', price:189.3, changePct:1.21, marketCap:3.1e12, pe:33.02 },
  { symbol:'MSFT', name:'Microsoft Corp.', price:415.2, changePct:-0.41, marketCap:3.1e12, pe:34.1 },
  { symbol:'NVDA', name:'NVIDIA Corp.', price:924.8, changePct:2.88, marketCap:2.28e12, pe:52.3 },
  { symbol:'GOOGL', name:'Alphabet Inc.', price:178.5, changePct:0.62, marketCap:2.21e12, pe:21.8 },
  { symbol:'META', name:'Meta Platforms', price:529.3, changePct:0.92, marketCap:1.34e12, pe:27.1 },
]

const NEWS_TOPICS = ['Front Page','Sustainable Finance','Central Banks','Earnings','M&A','Macro']

export default function AppOverview() {
  const [quotes, setQuotes] = useState<any[]>(WATCHLIST_STATIC)
  const [news, setNews] = useState<any[]>([])
  const [loadingNews, setLoadingNews] = useState(true)
  const [newsTopic, setNewsTopic] = useState('Front Page')
  const today = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})

  useEffect(() => {
    fetch('/api/news?topics=financial_markets&limit=10').then(r=>r.json()).then(d=>setNews(d.articles||[])).catch(()=>{}).finally(()=>setLoadingNews(false))
  }, [])

  const sc = (s:string) => s?.includes('Bullish')?'#059669':s?.includes('Bearish')?'#DC2626':'#D97706'
  const sb = (s:string) => s?.includes('Bullish')?'badge-green':s?.includes('Bearish')?'badge-red':'badge-amber'

  return (
    <div className="page-content">
      {/* Daily Briefing Header */}
      <div style={{marginBottom:24}}>
        <p style={{fontSize:12,fontWeight:700,color:'#7D8FA9',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Your Daily Briefing</p>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
          <h1 className="page-title">{today}</h1>
          <div style={{display:'flex',gap:8}}>
            <Link href="/app/research" className="btn btn-primary btn-sm">◎ AI Research</Link>
            <Link href="/app/screener" className="btn btn-outline btn-sm">▤ Screener</Link>
          </div>
        </div>
      </div>

      {/* Mini index cards — LSEG style */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12,marginBottom:24}}>
        {MINI_INDICES.map(idx=>{
          const pos = idx.change >= 0
          const sparkFormatted = idx.sparkData.map((v,i)=>({v}))
          return (
            <div key={idx.label} className="card" style={{padding:16}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <div>
                  <div style={{fontWeight:800,fontSize:14,color:'#0A1628',letterSpacing:'-0.01em'}}>{idx.label}</div>
                  <div style={{fontSize:11,color:'#B0BCD0'}}>{idx.name}</div>
                </div>
                <div style={{height:36,width:72}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkFormatted} margin={{top:2,right:0,bottom:2,left:0}}>
                      <defs><linearGradient id={`sg${idx.label}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={pos?'#059669':'#DC2626'} stopOpacity={0.2}/><stop offset="95%" stopColor={pos?'#059669':'#DC2626'} stopOpacity={0}/></linearGradient></defs>
                      <Area type="monotone" dataKey="v" stroke={pos?'#059669':'#DC2626'} strokeWidth={1.5} fill={`url(#sg${idx.label})`} dot={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div style={{fontWeight:900,fontSize:'1.125rem',color:'#0A1628',letterSpacing:'-0.02em'}}>{idx.price.toLocaleString('en-US',{minimumFractionDigits:2})}</div>
              <div style={{fontSize:12,fontWeight:700,color:pos?'#059669':'#DC2626',marginTop:2}}>{pos?'+':''}{idx.change.toFixed(2)}%</div>
            </div>
          )
        })}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:20,alignItems:'start'}}>
        {/* Left: Watchlist + Stats */}
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {/* Watchlist */}
          <div className="card" style={{overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 20px',borderBottom:'1px solid #E2E8F2'}}>
              <span style={{fontWeight:700,fontSize:14,color:'#0A1628'}}>Watchlist</span>
              <Link href="/app/watchlist" className="btn btn-ghost btn-sm">Manage →</Link>
            </div>
            <div style={{overflowX:'auto'}}>
              <table className="data-table">
                <thead><tr><th>Company</th><th className="right">Price</th><th className="right">Change</th><th className="right">Mkt Cap</th><th className="right">P/E</th><th></th></tr></thead>
                <tbody>
                  {quotes.map(q=>(
                    <tr key={q.symbol} style={{cursor:'pointer'}} onClick={()=>window.location.href=`/app/company/${q.symbol}`}>
                      <td><div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:30,height:30,borderRadius:8,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontWeight:900,flexShrink:0}}>{q.symbol[0]}</div>
                        <div><div style={{fontWeight:700,fontSize:13,color:'#0A1628'}}>{q.symbol}</div><div style={{fontSize:11,color:'#7D8FA9'}}>{q.name}</div></div>
                      </div></td>
                      <td className="right" style={{fontWeight:700,fontSize:13}}>${fmt(q.price)}</td>
                      <td className={`right ${changeClass(q.changePct)}`} style={{fontSize:13,fontWeight:600}}>{fmtPct(q.changePct)}</td>
                      <td className="right" style={{fontSize:13,color:'#3D4F6E'}}>{fmtLarge(q.marketCap)}</td>
                      <td className="right" style={{fontSize:13,color:'#3D4F6E'}}>{q.pe>0?`${fmt(q.pe)}x`:'—'}</td>
                      <td><Link href={`/app/company/${q.symbol}`} onClick={e=>e.stopPropagation()} className="btn btn-ghost btn-sm">View →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick action cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
            {[
              {label:'AI Research',desc:'Ask anything about any company',href:'/app/research',icon:'◎',color:'#1B4FFF'},
              {label:'M&A Screener',desc:'Browse live deals & transactions',href:'/app/screener',icon:'◳',color:'#059669'},
              {label:'Macro Dashboard',desc:'Global rates, FX, yield curves',href:'/app/macro',icon:'◷',color:'#D97706'},
            ].map(c=>(
              <Link key={c.label} href={c.href} style={{textDecoration:'none'}}>
                <div className="card" style={{padding:16,cursor:'pointer',transition:'box-shadow 0.14s'}}>
                  <div style={{width:32,height:32,borderRadius:9,background:`${c.color}15`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10,fontSize:16}}>{c.icon}</div>
                  <div style={{fontWeight:700,fontSize:13,color:'#0A1628',marginBottom:4}}>{c.label}</div>
                  <div style={{fontSize:11,color:'#7D8FA9',lineHeight:1.4}}>{c.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Right: News — LSEG Front Page style */}
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid #E2E8F2'}}>
            <div style={{fontWeight:700,fontSize:14,color:'#0A1628',marginBottom:10}}>News & Signals</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {NEWS_TOPICS.slice(0,4).map(t=>(
                <button key={t} onClick={()=>setNewsTopic(t)}
                  style={{padding:'4px 10px',borderRadius:999,fontSize:11,fontWeight:600,cursor:'pointer',border:'none',
                    background:newsTopic===t?'#1B4FFF':'#F0F4FA',color:newsTopic===t?'#fff':'#7D8FA9'}}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div style={{maxHeight:520,overflowY:'auto'}}>
            {loadingNews ? [...Array(5)].map((_,i)=>(
              <div key={i} style={{padding:'14px 16px',borderBottom:'1px solid #F0F4FA'}}>
                <div className="skeleton" style={{height:12,width:'80%',marginBottom:8}}/>
                <div className="skeleton" style={{height:12,width:'55%'}}/>
              </div>
            )) : news.map((n,i)=>(
              <a key={i} href={n.url} target="_blank" rel="noopener noreferrer"
                style={{display:'block',padding:'14px 16px',borderBottom:i<news.length-1?'1px solid #F0F4FA':'none',textDecoration:'none'}}>
                {i===0&&n.banner&&<img src={n.banner} alt="" style={{width:'100%',height:100,objectFit:'cover',borderRadius:8,marginBottom:10}} onError={e=>(e.currentTarget.style.display='none')}/>}
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                  <span style={{fontWeight:700,fontSize:11,color:sc(n.sentiment)}}>●</span>
                  {n.tickers?.slice(0,3).map((t:string)=><span key={t} style={{fontSize:10,fontWeight:700,color:'#1B4FFF',background:'#EEF3FF',padding:'1px 6px',borderRadius:4}}>{t}</span>)}
                  <span style={{fontSize:10,color:'#B0BCD0',marginLeft:'auto'}}>{n.publishedAt?.slice(5,10)} · {n.source}</span>
                </div>
                <p style={{fontSize:13,fontWeight:600,color:'#0A1628',lineHeight:1.45,margin:0}}>{n.title}</p>
                {i===0&&<p style={{fontSize:12,color:'#7D8FA9',lineHeight:1.5,marginTop:6}}>{n.summary?.slice(0,160)}...</p>}
              </a>
            ))}
          </div>
          <div style={{padding:'10px 16px',borderTop:'1px solid #E2E8F2'}}>
            <Link href="/app/news" className="btn btn-ghost btn-sm" style={{width:'100%',justifyContent:'center'}}>View All News →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Article { title:string; source:string; publishedAt:string; url:string; summary?:string; tickers?:string[] }
interface EarningsEvent { symbol:string; name:string; date:string; epsEst:number; revenueEst:number; timing:'BMO'|'AMC' }

const CATEGORIES = ['All','Markets','Economy','Technology','Healthcare','Energy','Earnings']

export default function NewsPage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [earnings, setEarnings] = useState<EarningsEvent[]>([])
  const [tab, setTab]           = useState<'news'|'earnings'>('news')
  const [cat, setCat]           = useState('All')
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/news?limit=30').then(r=>r.json()).catch(()=>({})),
      fetch('/api/earnings-calendar').then(r=>r.json()).catch(()=>({})),
    ]).then(([n, e]) => {
      setArticles(n.articles || [])
      setEarnings(e.events || e.earnings || [])
      setLoading(false)
    })
  }, [])

  const FALLBACK_NEWS: Article[] = [
    {title:'Federal Reserve holds rates steady, signals two cuts in 2025 amid easing inflation',source:'Reuters',publishedAt:'2025-04-14',url:'#',tickers:['SPY','TLT']},
    {title:'NVIDIA posts record-breaking quarterly revenue, raises full-year guidance on AI demand',source:'Bloomberg',publishedAt:'2025-04-14',url:'#',tickers:['NVDA']},
    {title:'Apple services revenue hits all-time high at $23.1 billion, expanding margins further',source:'CNBC',publishedAt:'2025-04-13',url:'#',tickers:['AAPL']},
    {title:'European Central Bank cuts rates 25bps as growth concerns mount across the eurozone',source:'FT',publishedAt:'2025-04-13',url:'#',tickers:['FEZ','EWG']},
    {title:'Tesla misses delivery targets for second consecutive quarter, stock falls 4%',source:'WSJ',publishedAt:'2025-04-12',url:'#',tickers:['TSLA']},
    {title:'Microsoft Azure cloud revenue surges 29% as enterprise AI adoption accelerates',source:'Bloomberg',publishedAt:'2025-04-12',url:'#',tickers:['MSFT']},
    {title:'Oil prices slide on US inventory build, OPEC+ production increase concerns',source:'Reuters',publishedAt:'2025-04-11',url:'#',tickers:['USO','XOM']},
    {title:'JPMorgan beats estimates on strong trading and investment banking performance',source:'CNBC',publishedAt:'2025-04-11',url:'#',tickers:['JPM']},
  ]

  const FALLBACK_EARNINGS: EarningsEvent[] = [
    {symbol:'AAPL',name:'Apple Inc.',        date:'2025-04-24',epsEst:1.62,revenueEst:95.5e9, timing:'AMC'},
    {symbol:'MSFT',name:'Microsoft Corp.',   date:'2025-04-25',epsEst:3.10,revenueEst:68.4e9, timing:'AMC'},
    {symbol:'META',name:'Meta Platforms',    date:'2025-04-23',epsEst:4.32,revenueEst:39.1e9, timing:'AMC'},
    {symbol:'AMZN',name:'Amazon.com',        date:'2025-05-01',epsEst:1.02,revenueEst:151.8e9,timing:'AMC'},
    {symbol:'GOOGL',name:'Alphabet Inc.',    date:'2025-04-22',epsEst:1.89,revenueEst:89.2e9, timing:'AMC'},
    {symbol:'TSLA',name:'Tesla Inc.',        date:'2025-04-22',epsEst:0.58,revenueEst:23.9e9, timing:'AMC'},
    {symbol:'NVDA',name:'NVIDIA Corp.',      date:'2025-05-21',epsEst:5.65,revenueEst:43.2e9, timing:'AMC'},
    {symbol:'JPM', name:'JPMorgan Chase',    date:'2025-04-11',epsEst:4.58,revenueEst:43.8e9, timing:'BMO'},
  ]

  const displayNews  = articles.length  ? articles  : FALLBACK_NEWS
  const displayEarns = earnings.length ? earnings : FALLBACK_EARNINGS

  function fmtB(n:number){if(n>=1e9)return`$${(n/1e9).toFixed(1)}B`;if(n>=1e6)return`$${(n/1e6).toFixed(0)}M`;return`$${n}`}

  return (
    <div style={{padding:'1.75rem',maxWidth:1400,margin:'0 auto'}}>
      <div style={{marginBottom:24}}>
        <h1 className="page-title">News & Signals</h1>
        <p style={{fontSize:13,color:'#9BAFC8',marginTop:3}}>Live market news, earnings calendar, and analyst signals</p>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn${tab==='news'?' active':''}`} onClick={()=>setTab('news')}>Market News</button>
        <button className={`tab-btn${tab==='earnings'?' active':''}`} onClick={()=>setTab('earnings')}>Earnings Calendar</button>
      </div>

      {tab==='news' && (
        <>
          {/* Category filter */}
          <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
            {CATEGORIES.map(c=>(
              <button key={c} onClick={()=>setCat(c)}
                style={{padding:'5px 14px',borderRadius:20,fontSize:12,fontWeight:600,border:'1.5px solid',cursor:'pointer',transition:'all 0.12s',
                  background:cat===c?'#0A1628':'#fff',color:cat===c?'#fff':'#7D8FA9',borderColor:cat===c?'#0A1628':'#E2E8F2'}}>
                {c}
              </button>
            ))}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:20}}>
            {/* Main feed */}
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {(loading?Array(6).fill(null):displayNews).map((a:any,i:number)=>(
                <div key={i} className="card" style={{padding:'18px 20px',transition:'box-shadow 0.15s',cursor:'pointer'}}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.boxShadow='0 4px 20px rgba(0,0,0,0.08)'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.boxShadow='none'}>
                  {loading ? (
                    <div><div className="skeleton" style={{width:'90%',height:18,marginBottom:10}}/><div className="skeleton" style={{width:'50%',height:12}}/></div>
                  ) : (
                    <>
                      <a href={a.url||'#'} target="_blank" rel="noreferrer"
                        style={{fontSize:15,fontWeight:700,color:'#0A1628',textDecoration:'none',lineHeight:1.5,display:'block',marginBottom:8,transition:'color 0.12s'}}
                        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='#1B4FFF'}
                        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='#0A1628'}>
                        {a.title}
                      </a>
                      {a.summary && <p style={{fontSize:13,color:'#4A5568',lineHeight:1.6,marginBottom:10}}>{a.summary}</p>}
                      <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                        <span style={{fontSize:12,fontWeight:600,color:'#3D4F6E'}}>{a.source||a.publisher}</span>
                        <span style={{fontSize:12,color:'#9BAFC8'}}>{a.publishedAt||a.date}</span>
                        {a.tickers?.map((t:string)=>(
                          <Link key={t} href={`/app/company/${t}`}
                            style={{padding:'2px 8px',borderRadius:6,background:'#EEF3FF',color:'#1B4FFF',fontSize:11,fontWeight:700,textDecoration:'none'}}>{t}</Link>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Sidebar: trending tickers */}
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <div className="card" style={{overflow:'hidden'}}>
                <div style={{padding:'14px 16px',borderBottom:'1px solid #E2E8F2',fontSize:13,fontWeight:700,color:'#0A1628'}}>Trending Tickers</div>
                {['NVDA','AAPL','TSLA','META','MSFT','AMZN','GOOGL'].map((sym,i)=>(
                  <Link key={sym} href={`/app/company/${sym}`}
                    style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',borderBottom:'1px solid #F0F4FA',textDecoration:'none',background:'#fff',transition:'background 0.12s'}}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#F8FAFD'}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='#fff'}>
                    <span style={{fontSize:12,fontWeight:700,color:'#9BAFC8',width:16}}>#{i+1}</span>
                    <span style={{fontSize:13,fontWeight:700,color:'#0A1628',flex:1}}>{sym}</span>
                    <span style={{fontSize:12,color:'#059669',fontWeight:600}}>↑</span>
                  </Link>
                ))}
              </div>

              <div className="card" style={{padding:16}}>
                <div style={{fontSize:13,fontWeight:700,color:'#0A1628',marginBottom:12}}>AI Research</div>
                <p style={{fontSize:12,color:'#7D8FA9',marginBottom:12,lineHeight:1.6}}>Ask Finsyt AI to analyze any news story or market event in depth.</p>
                <Link href="/app/research" className="btn btn-primary" style={{display:'block',textAlign:'center',fontSize:13}}>Open AI Research →</Link>
              </div>
            </div>
          </div>
        </>
      )}

      {tab==='earnings' && (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
            {displayEarns.map((e,i)=>(
              <Link key={i} href={`/app/company/${e.symbol}`}
                style={{textDecoration:'none'}}
                onMouseEnter={ev=>(ev.currentTarget as HTMLElement).style.transform='translateY(-1px)'}
                onMouseLeave={ev=>(ev.currentTarget as HTMLElement).style.transform='none'}>
                <div className="card" style={{padding:'16px 18px',transition:'all 0.15s'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:36,height:36,borderRadius:8,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontWeight:900,flexShrink:0}}>{e.symbol.slice(0,2)}</div>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:'#0A1628'}}>{e.symbol}</div>
                        <div style={{fontSize:11,color:'#9BAFC8',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.name}</div>
                      </div>
                    </div>
                    <span className={`badge ${e.timing==='BMO'?'badge-amber':'badge-blue'}`}>{e.timing}</span>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                    <div>
                      <div style={{fontSize:10,fontWeight:600,color:'#9BAFC8',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:3}}>Date</div>
                      <div style={{fontSize:13,fontWeight:700,color:'#0A1628'}}>{e.date}</div>
                    </div>
                    <div>
                      <div style={{fontSize:10,fontWeight:600,color:'#9BAFC8',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:3}}>EPS Est.</div>
                      <div style={{fontSize:13,fontWeight:700,color:'#0A1628'}}>${e.epsEst?.toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{fontSize:10,fontWeight:600,color:'#9BAFC8',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:3}}>Rev Est.</div>
                      <div style={{fontSize:13,fontWeight:700,color:'#0A1628'}}>{fmtB(e.revenueEst)}</div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

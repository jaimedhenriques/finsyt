'use client'
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { fmtLarge, fmtPct, fmt, fmtNum, changeClass, formatDate } from '@/lib/utils'

const RANGES = ['1W','1M','3M','6M','1Y','5Y']

export default function CompanyPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params)
  const SYM = symbol?.toUpperCase()

  const [quote, setQuote] = useState<any>(null)
  const [financials, setFinancials] = useState<any>(null)
  const [news, setNews] = useState<any[]>([])
  const [earnings, setEarnings] = useState<any>(null)
  const [tab, setTab] = useState<'overview'|'financials'|'comps'|'news'|'filings'>('overview')
  const [finTab, setFinTab] = useState<'income'|'balance'|'cashflow'|'earnings'>('income')
  const [period, setPeriod] = useState<'annual'|'quarterly'>('annual')
  const [range, setRange] = useState('1Y')
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<any[]>([])

  // Generate simulated chart data
  function genChart(price: number, rangeKey: string) {
    const points: Record<string,number> = {'1W':7,'1M':30,'3M':90,'6M':180,'1Y':252,'5Y':1260}
    const n = points[rangeKey] || 252
    const data = []
    let p = price * (0.7 + Math.random()*0.3)
    const trend = (price - p) / n
    for (let i = 0; i < n; i++) {
      p += trend + (Math.random()-0.46)*price*0.018
      const vol = Math.floor(Math.random()*30000000+5000000)
      const d = new Date(); d.setDate(d.getDate() - (n - i))
      data.push({ date: d.toLocaleDateString('en-GB',{month:'short',day:'numeric'}), price: parseFloat(p.toFixed(2)), volume: vol })
    }
    data[data.length-1].price = price
    return data
  }

  useEffect(() => {
    setLoading(true)
    async function load() {
      try {
        const qres = await fetch(`/api/quote?symbol=${SYM}`)
        const q = await qres.json()
        if (!q.error) { setQuote(q); setChartData(genChart(q.price, range)) }
      } catch {}
      try {
        const fres = await fetch(`/api/financials?symbol=${SYM}&type=income`)
        const f = await fres.json()
        setFinancials(f)
      } catch {}
      try {
        const eres = await fetch(`/api/financials?symbol=${SYM}&type=earnings`)
        const e = await eres.json()
        setEarnings(e)
      } catch {}
      try {
        const nres = await fetch(`/api/news?symbol=${SYM}&limit=8`)
        const n = await nres.json()
        setNews(n.articles || [])
      } catch {}
      setLoading(false)
    }
    load()
  }, [SYM])

  useEffect(() => {
    if (quote?.price) setChartData(genChart(quote.price, range))
  }, [range])

  const sc = (s:string) => s?.includes('Bullish') ? '#059669' : s?.includes('Bearish') ? '#DC2626' : '#D97706'

  // Peer comps data
  const PEERS: Record<string, any[]> = {
    AAPL: [{s:'AAPL',n:'Apple',mc:3.1e12,pe:33,ps:8.2,pb:48.2,roe:160,gm:44.5,ebitda:35.2,rev:385e9,growth:2.3,debt:1.1,div:0.5},{s:'MSFT',n:'Microsoft',mc:3.1e12,pe:34,ps:13.1,pb:12.8,roe:38.7,gm:70.1,ebitda:42.3,rev:228e9,growth:17.6,debt:0.3,div:0.7},{s:'GOOGL',n:'Alphabet',mc:2.2e12,pe:22,ps:6.4,pb:6.8,roe:28.4,gm:56.9,ebitda:31.2,rev:340e9,growth:14.1,debt:0.1,div:0},{s:'META',n:'Meta',mc:1.3e12,pe:27,ps:9.1,pb:8.3,roe:32.1,gm:81.5,ebitda:38.7,rev:147e9,growth:22.4,debt:0.1,div:0},{s:'NVDA',n:'NVIDIA',mc:2.9e12,pe:52,ps:26.4,pb:42.1,roe:124.5,gm:74.3,ebitda:57.4,rev:110e9,growth:122,debt:0.2,div:0.1}],
  }
  const peers = PEERS[SYM] || PEERS['AAPL']

  if (loading) return (
    <div className="page-content">
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}>
        <Link href="/app" className="btn btn-ghost btn-sm">← Back</Link>
        <div className="skeleton" style={{height:32,width:200}} />
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16,marginBottom:20}}>
        {[1,2,3].map(i=><div key={i} className="metric-card"><div className="skeleton" style={{height:60}} /></div>)}
      </div>
      <div className="card" style={{height:320}}><div className="skeleton" style={{height:'100%',borderRadius:12}} /></div>
    </div>
  )

  if (!quote) return (
    <div className="page-content">
      <Link href="/app" className="btn btn-ghost btn-sm" style={{marginBottom:16}}>← Back</Link>
      <div className="card" style={{padding:64,textAlign:'center'}}>
        <p style={{fontSize:18,fontWeight:700,color:'#0A1628',marginBottom:8}}>Symbol not found: {SYM}</p>
        <p style={{color:'#7D8FA9'}}>Try AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, JPM</p>
        <Link href="/app/screener" className="btn btn-primary" style={{marginTop:16}}>Browse Screener</Link>
      </div>
    </div>
  )

  const pricePos = quote.changePct >= 0
  const chartColor = pricePos ? '#059669' : '#DC2626'

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',gap:16,marginBottom:24,flexWrap:'wrap'}}>
        <Link href="/app" className="btn btn-ghost btn-sm" style={{marginTop:4}}>← Back</Link>
        <div style={{display:'flex',alignItems:'center',gap:16,flex:1}}>
          <div style={{width:48,height:48,borderRadius:12,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:900,fontSize:18,flexShrink:0}}>{SYM[0]}</div>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              <h1 style={{fontSize:'1.5rem',fontWeight:900,color:'#0A1628',letterSpacing:'-0.025em'}}>{quote.name}</h1>
              <span className="badge badge-gray">{SYM}</span>
              <span className="badge badge-gray">{quote.exchange}</span>
            </div>
            <p style={{fontSize:13,color:'#7D8FA9',marginTop:2}}>{quote.sector} · {quote.industry}</p>
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:'2rem',fontWeight:900,color:'#0A1628',letterSpacing:'-0.03em'}}>${fmt(quote.price)}</div>
          <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'flex-end'}}>
            <span style={{fontSize:14,fontWeight:700,color:chartColor}}>{pricePos?'+':''}{fmt(quote.change)}</span>
            <span className={`badge ${pricePos?'badge-green':'badge-red'}`}>{fmtPct(quote.changePct)}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{marginBottom:20}}>
        {['overview','financials','comps','news','filings'].map(t=>(
          <button key={t} className={`tab-btn ${tab===t?'active':''}`} onClick={()=>setTab(t as any)} style={{textTransform:'capitalize'}}>{t}</button>
        ))}
      </div>

      {tab==='overview' && (
        <div>
          {/* Key metrics */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:12,marginBottom:20}}>
            {[
              {l:'Market Cap',v:fmtLarge(quote.marketCap)},{l:'P/E Ratio',v:quote.pe>0?`${fmt(quote.pe)}x`:'—'},
              {l:'EPS (TTM)',v:quote.eps>0?`$${fmt(quote.eps)}`:'—'},{l:'52W High',v:`$${fmt(quote.week52High)}`},
              {l:'52W Low',v:`$${fmt(quote.week52Low)}`},{l:'Div Yield',v:quote.dividendYield>0?fmtPct(quote.dividendYield*100):'—'},
              {l:'Beta',v:quote.beta>0?fmt(quote.beta,2):'—'},{l:'Analyst Target',v:quote.analystTarget>0?`$${fmt(quote.analystTarget)}`:'—'},
              {l:'Fwd P/E',v:quote.forwardPE>0?`${fmt(quote.forwardPE)}x`:'—'},{l:'P/B Ratio',v:quote.priceToBook>0?`${fmt(quote.priceToBook)}x`:'—'},
              {l:'ROE',v:quote.returnOnEquity>0?fmtPct(quote.returnOnEquity*100):'—'},{l:'Profit Margin',v:quote.profitMargin>0?fmtPct(quote.profitMargin*100):'—'},
            ].map(m=>(
              <div key={m.l} className="metric-card" style={{padding:'12px 16px'}}>
                <div className="label" style={{marginBottom:6}}>{m.l}</div>
                <div style={{fontWeight:800,fontSize:'1rem',color:'#0A1628',letterSpacing:'-0.01em'}}>{m.v}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="card" style={{padding:20,marginBottom:20}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:12}}>
              <div>
                <span style={{fontWeight:700,fontSize:15,color:'#0A1628'}}>{SYM} Price Chart</span>
                <span style={{marginLeft:12,fontSize:13,fontWeight:700,color:chartColor}}>{pricePos?'+':''}{fmt(quote.change)} ({fmtPct(quote.changePct)})</span>
              </div>
              <div style={{display:'flex',gap:4}}>
                {RANGES.map(r=>(
                  <button key={r} onClick={()=>setRange(r)}
                    style={{padding:'4px 10px',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',border:'1.5px solid',
                      borderColor:range===r?'#1B4FFF':'#E2E8F2',background:range===r?'#EEF3FF':'transparent',color:range===r?'#1B4FFF':'#7D8FA9'}}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div style={{height:280}}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{top:4,right:0,bottom:0,left:0}}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.15}/>
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA"/>
                  <XAxis dataKey="date" tick={{fontSize:10,fill:'#B0BCD0'}} interval={Math.floor(chartData.length/6)} />
                  <YAxis tick={{fontSize:10,fill:'#B0BCD0'}} tickFormatter={v=>`$${v}`} domain={['auto','auto']} width={60}/>
                  <Tooltip formatter={(v:any)=>[`$${fmt(v)}`,SYM]} contentStyle={{fontSize:12,borderRadius:8,border:'1px solid #E2E8F2'}}/>
                  <Area type="monotone" dataKey="price" stroke={chartColor} strokeWidth={2} fill="url(#priceGrad)" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {/* Volume */}
            <div style={{height:60,marginTop:4}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{top:0,right:0,bottom:0,left:0}}>
                  <XAxis dataKey="date" hide/>
                  <YAxis hide/>
                  <Bar dataKey="volume" fill="#E2E8F2" radius={[1,1,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Description + earnings preview */}
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16}}>
            <div className="card" style={{padding:20}}>
              <div className="section-title">About {quote.name}</div>
              <p style={{fontSize:13,color:'#3D4F6E',lineHeight:1.7}}>{quote.description||'No description available.'}</p>
            </div>
            {earnings?.quarterly?.length>0 && (
              <div className="card" style={{padding:20}}>
                <div className="section-title">EPS vs Estimate</div>
                <div style={{height:160}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={earnings.quarterly.slice(0,4).reverse()} margin={{top:4,right:0,bottom:0,left:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA"/>
                      <XAxis dataKey="date" tick={{fontSize:10,fill:'#B0BCD0'}} tickFormatter={v=>v?.slice(0,7)}/>
                      <YAxis tick={{fontSize:10,fill:'#B0BCD0'}} width={30}/>
                      <Tooltip contentStyle={{fontSize:12,borderRadius:8}}/>
                      <Bar dataKey="reportedEPS" name="Reported EPS" fill="#1B4FFF" radius={[3,3,0,0]}/>
                      <Bar dataKey="estimatedEPS" name="Estimated EPS" fill="#E2E8F2" radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab==='financials' && (
        <div>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,flexWrap:'wrap'}}>
            <div className="tab-bar" style={{marginBottom:0,borderBottom:'none'}}>
              {['income','balance','cashflow','earnings'].map(t=>(
                <button key={t} className={`tab-btn ${finTab===t?'active':''}`} onClick={()=>setFinTab(t as any)} style={{textTransform:'capitalize',fontSize:13}}>{t==='cashflow'?'Cash Flow':t==='earnings'?'Earnings':t==='income'?'Income Stmt':'Balance Sheet'}</button>
              ))}
            </div>
            <div style={{marginLeft:'auto',display:'flex',gap:4}}>
              {(['annual','quarterly'] as const).map(p=>(
                <button key={p} onClick={()=>setPeriod(p)} style={{padding:'4px 12px',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',border:'1.5px solid',borderColor:period===p?'#1B4FFF':'#E2E8F2',background:period===p?'#EEF3FF':'transparent',color:period===p?'#1B4FFF':'#7D8FA9'}}>{p==='annual'?'Annual':'Quarterly'}</button>
              ))}
            </div>
          </div>

          <FinancialsTable symbol={SYM} type={finTab} period={period} />
        </div>
      )}

      {tab==='comps' && (
        <div>
          <div style={{marginBottom:16}}>
            <h2 style={{fontSize:'1rem',fontWeight:700,color:'#0A1628'}}>Peer Comparison — {SYM} vs Industry</h2>
            <p style={{fontSize:13,color:'#7D8FA9',marginTop:4}}>Benchmarked across valuation, profitability, and growth metrics</p>
          </div>
          <div className="card" style={{overflowX:'auto'}}>
            <table className="data-table">
              <thead><tr>
                <th>Company</th><th className="right">Mkt Cap</th><th className="right">P/E</th>
                <th className="right">P/S</th><th className="right">P/B</th><th className="right">ROE %</th>
                <th className="right">Gross Margin</th><th className="right">EBITDA Margin</th>
                <th className="right">Revenue</th><th className="right">Rev Growth</th><th className="right">Debt/Eq</th>
              </tr></thead>
              <tbody>
                {peers.map((p:any,i:number)=>(
                  <tr key={i} style={{background:p.s===SYM?'#F0F4FF':''}}>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:28,height:28,borderRadius:7,background:p.s===SYM?'linear-gradient(135deg,#1B4FFF,#0D9FE8)':'#F0F4FA',display:'flex',alignItems:'center',justifyContent:'center',color:p.s===SYM?'#fff':'#7D8FA9',fontSize:11,fontWeight:900}}>{p.s[0]}</div>
                        <div>
                          <span style={{fontWeight:p.s===SYM?800:600,fontSize:13,color:p.s===SYM?'#1B4FFF':'#0A1628'}}>{p.s}</span>
                          {p.s===SYM&&<span className="badge badge-blue" style={{marginLeft:6,fontSize:10}}>Selected</span>}
                          <div style={{fontSize:11,color:'#B0BCD0'}}>{p.n}</div>
                        </div>
                      </div>
                    </td>
                    <td className="right" style={{fontSize:13,fontWeight:600}}>{fmtLarge(p.mc)}</td>
                    <td className="right" style={{fontSize:13}}>{p.pe}x</td>
                    <td className="right" style={{fontSize:13}}>{p.ps}x</td>
                    <td className="right" style={{fontSize:13}}>{p.pb}x</td>
                    <td className="right" style={{fontSize:13,color:p.roe>30?'#059669':'#3D4F6E',fontWeight:p.roe>30?700:400}}>{p.roe}%</td>
                    <td className="right" style={{fontSize:13,color:p.gm>60?'#059669':'#3D4F6E',fontWeight:p.gm>60?700:400}}>{p.gm}%</td>
                    <td className="right" style={{fontSize:13,color:p.ebitda>35?'#059669':'#3D4F6E'}}>{p.ebitda}%</td>
                    <td className="right" style={{fontSize:13}}>{fmtLarge(p.rev)}</td>
                    <td className={`right ${changeClass(p.growth)}`} style={{fontSize:13,fontWeight:600}}>{fmtPct(p.growth)}</td>
                    <td className="right" style={{fontSize:13,color:p.debt<0.5?'#059669':p.debt>1?'#DC2626':'#3D4F6E'}}>{p.debt}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Industry KPIs */}
          <div className="card" style={{marginTop:16,padding:20}}>
            <div className="section-title">Industry-Specific KPIs</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12}}>
              {[
                {l:'Rule of 40',v:'92',note:'Revenue growth + EBITDA margin',good:true},
                {l:'Net Dollar Retention',v:'125%',note:'Customer expansion signal',good:true},
                {l:'R&D / Revenue',v:'8.2%',note:'vs 12.1% sector avg',good:true},
                {l:'CapEx / Revenue',v:'3.1%',note:'Asset-light model',good:true},
                {l:'FCF Yield',v:'3.8%',note:'Based on market cap',good:true},
                {l:'Cash Conversion',v:'107%',note:'Net income to FCF',good:true},
              ].map(k=>(
                <div key={k.l} style={{background:'#F8FAFD',borderRadius:10,padding:'12px 16px',border:'1px solid #E2E8F2'}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#7D8FA9',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>{k.l}</div>
                  <div style={{fontWeight:900,fontSize:'1.25rem',color:k.good?'#059669':'#DC2626',letterSpacing:'-0.02em'}}>{k.v}</div>
                  <div style={{fontSize:11,color:'#B0BCD0',marginTop:4}}>{k.note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab==='news' && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))',gap:16}}>
          {news.map((n,i)=>(
            <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="card"
              style={{display:'block',padding:20,textDecoration:'none'}}>
              <div style={{display:'flex',gap:8,marginBottom:8,flexWrap:'wrap'}}>
                <span style={{fontWeight:700,fontSize:12,color:'#1B4FFF'}}>{n.source}</span>
                <span style={{fontSize:11,color:'#B0BCD0'}}>{n.publishedAt?.slice(0,10)}</span>
                <span style={{color:sc(n.sentiment),fontSize:11,fontWeight:700,marginLeft:'auto'}}>{n.sentiment?.replace(/_/g,' ')}</span>
              </div>
              <h3 style={{fontSize:13,fontWeight:600,color:'#0A1628',lineHeight:1.5,marginBottom:8}}>{n.title}</h3>
              <p style={{fontSize:12,color:'#7D8FA9',lineHeight:1.6}}>{n.summary?.slice(0,140)}...</p>
            </a>
          ))}
          {news.length===0&&<div className="card" style={{padding:48,textAlign:'center',gridColumn:'1/-1'}}>
            <p style={{color:'#7D8FA9'}}>No news available for {SYM}</p>
          </div>}
        </div>
      )}

      {tab==='filings' && <FilingsTab symbol={SYM} />}
    </div>
  )
}

function FinancialsTable({ symbol, type, period }: { symbol:string, type:string, period:string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/financials?symbol=${symbol}&type=${type}`)
      .then(r=>r.json()).then(d=>{setData(d);setLoading(false)}).catch(()=>setLoading(false))
  }, [symbol,type])

  if (loading) return <div className="card" style={{padding:40,textAlign:'center'}}><div className="skeleton" style={{height:200}} /></div>
  if (!data) return <div className="card" style={{padding:40,textAlign:'center'}}><p style={{color:'#7D8FA9'}}>No data</p></div>

  if (type==='earnings') {
    const rows = data[period] || []
    return (
      <div className="card" style={{overflowX:'auto'}}>
        <table className="data-table">
          <thead><tr><th>Period</th>{period==='quarterly'&&<th>Reported</th>}<th className="right">Reported EPS</th><th className="right">Estimated EPS</th><th className="right">Surprise</th><th className="right">Surprise %</th></tr></thead>
          <tbody>
            {rows.map((r:any,i:number)=>(
              <tr key={i}>
                <td style={{fontWeight:600}}>{r.date}</td>
                {period==='quarterly'&&<td style={{fontSize:12,color:'#7D8FA9'}}>{r.reportedDate}</td>}
                <td className="right" style={{fontWeight:700}}>{r.reportedEPS!=null?`$${fmt(r.reportedEPS)}`:'—'}</td>
                <td className="right" style={{color:'#7D8FA9'}}>{r.estimatedEPS!=null?`$${fmt(r.estimatedEPS)}`:'—'}</td>
                <td className={`right ${r.surprise>0?'pos':r.surprise<0?'neg':''}`}>{r.surprise!=null?`$${fmt(r.surprise)}`:'—'}</td>
                <td className={`right ${r.surprisePct>0?'pos':r.surprisePct<0?'neg':''}`}>{r.surprisePct!=null?fmtPct(r.surprisePct):'—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const rows = data[period] || []
  if (!rows.length) return <div className="card" style={{padding:40,textAlign:'center'}}><p style={{color:'#7D8FA9'}}>No {period} data available for this symbol</p></div>

  const INCOME_KEYS = [
    {k:'totalRevenue',l:'Revenue',pct:false},{k:'grossProfit',l:'Gross Profit',pct:false},{k:'ebitda',l:'EBITDA',pct:false},
    {k:'operatingIncome',l:'Operating Income',pct:false},{k:'netIncome',l:'Net Income',pct:false},
    {k:'costOfRevenue',l:'Cost of Revenue',pct:false},{k:'researchAndDevelopment',l:'R&D',pct:false},
    {k:'sellingGeneralAndAdministrative',l:'SG&A',pct:false},
  ]
  const BALANCE_KEYS = [
    {k:'totalAssets',l:'Total Assets',pct:false},{k:'totalCurrentAssets',l:'Current Assets',pct:false},
    {k:'cashAndCashEquivalentsAtCarryingValue',l:'Cash & Equivalents',pct:false},
    {k:'totalLiabilities',l:'Total Liabilities',pct:false},{k:'totalCurrentLiabilities',l:'Current Liabilities',pct:false},
    {k:'longTermDebt',l:'Long-term Debt',pct:false},{k:'totalShareholderEquity',l:'Shareholder Equity',pct:false},
  ]
  const CF_KEYS = [
    {k:'operatingCashflow',l:'Operating Cash Flow',pct:false},{k:'capitalExpenditures',l:'CapEx',pct:false},
    {k:'cashflowFromInvestment',l:'Investing CF',pct:false},{k:'cashflowFromFinancing',l:'Financing CF',pct:false},
    {k:'dividendPayout',l:'Dividends Paid',pct:false},{k:'changeInCash',l:'Net Change in Cash',pct:false},
  ]
  const keys = type==='income'?INCOME_KEYS:type==='balance'?BALANCE_KEYS:CF_KEYS
  const cols = rows.slice(0, period==='annual'?5:6)

  return (
    <div className="card" style={{overflowX:'auto'}}>
      <table className="data-table">
        <thead><tr>
          <th style={{width:200}}>Metric (USD mn)</th>
          {cols.map((c:any,i:number)=><th key={i} className="right">{c.date?.slice(0,7)}</th>)}
          <th className="right">YoY Chg</th>
        </tr></thead>
        <tbody>
          {keys.map(({k,l})=>{
            const vals = cols.map((c:any)=>c[k])
            const latest = vals[0], prev = vals[1]
            const yoy = latest!=null&&prev!=null&&prev!==0 ? ((latest-prev)/Math.abs(prev))*100 : null
            return (
              <tr key={k}>
                <td style={{fontWeight:600,fontSize:13,color:'#1C2B4A'}}>{l}</td>
                {vals.map((v:any,i:number)=>(
                  <td key={i} className="right" style={{fontSize:13,color:'#3D4F6E'}}>{v!=null?fmtLarge(v):'—'}</td>
                ))}
                <td className={`right ${yoy!=null?(yoy>0?'pos':'neg'):''}`} style={{fontSize:13,fontWeight:600}}>
                  {yoy!=null?fmtPct(yoy):'—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FilingsTab({ symbol }: { symbol:string }) {
  const [filings, setFilings] = useState<any[]>([])
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/filings?symbol=${symbol}`).then(r=>r.json()).then(d=>{
      setFilings(d.filings||[]);setCompany(d.company||symbol);setLoading(false)
    }).catch(()=>setLoading(false))
  },[symbol])

  const fc:Record<string,string> = {'10-K':'badge-blue','10-Q':'badge-blue','8-K':'badge-amber','DEF 14A':'badge-gray','4':'badge-gray','S-1':'badge-green'}
  if (loading) return <div className="card" style={{padding:48,textAlign:'center'}}><div className="skeleton" style={{height:200}} /></div>
  return (
    <div className="card" style={{overflowX:'auto'}}>
      <table className="data-table">
        <thead><tr><th>Form</th><th>Filing Date</th><th>Accession #</th><th></th></tr></thead>
        <tbody>
          {filings.map((f,i)=>(
            <tr key={i}>
              <td><span className={`badge ${fc[f.form]||'badge-gray'}`}>{f.form}</span></td>
              <td style={{fontSize:13,color:'#3D4F6E'}}>{f.date}</td>
              <td style={{fontSize:11,fontFamily:'monospace',color:'#B0BCD0'}}>{f.accessionNumber}</td>
              <td><a href={f.docUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">SEC →</a></td>
            </tr>
          ))}
          {!filings.length&&<tr><td colSpan={4} style={{textAlign:'center',padding:48,color:'#7D8FA9'}}>No filings found for {symbol}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

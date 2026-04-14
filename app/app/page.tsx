'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'

const QUICK_LINKS = [
  { href:'/app/research',   icon:'◎', label:'AI Research',    desc:'Ask anything about any company' },
  { href:'/app/screener',   icon:'▤', label:'Screener',       desc:'Filter 70K+ securities' },
  { href:'/app/watchlist',  icon:'◈', label:'Watchlist',      desc:'Live prices & alerts' },
  { href:'/app/filings',    icon:'▣', label:'SEC Filings',    desc:'10-K, 10-Q, 8-K instant access' },
  { href:'/app/markets',    icon:'◲', label:'Markets',        desc:'Global indices & FX' },
  { href:'/app/macro',      icon:'◷', label:'Macro',          desc:'FRED, yields & indicators' },
]

const RECENT = [
  { symbol:'AAPL',  name:'Apple Inc.',         price:173.50, chg:1.24, pct:0.72 },
  { symbol:'NVDA',  name:'NVIDIA Corporation', price:878.40, chg:12.30,pct:1.42 },
  { symbol:'MSFT',  name:'Microsoft Corp.',    price:415.80, chg:-2.10,pct:-0.50 },
  { symbol:'TSLA',  name:'Tesla Inc.',         price:175.20, chg:-4.80,pct:-2.66 },
]

const METRICS = [
  { label:'S&P 500',    value:'5,218.19', chg:'+0.87%', pos:true },
  { label:'NASDAQ',     value:'16,384.47',chg:'+1.24%', pos:true },
  { label:'10Y Yield',  value:'4.42%',    chg:'+0.03', pos:false },
  { label:'VIX',        value:'13.48',    chg:'-0.82%', pos:true },
  { label:'DXY',        value:'104.32',   chg:'-0.14%', pos:true },
  { label:'Gold',       value:'2,341',    chg:'+0.32%', pos:true },
]

function genSpark(base: number, n = 20) {
  const arr = [base]
  for (let i = 1; i < n; i++) arr.push(arr[i-1] * (1 + (Math.random()-0.48)*0.012))
  return arr
}

export default function OverviewPage() {
  const [time, setTime] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setTime(new Date()), 60000); return () => clearInterval(id) }, [])

  return (
    <div style={{padding:'1.75rem',maxWidth:1400,margin:'0 auto'}}>
      {/* Header */}
      <div style={{marginBottom:28}}>
        <div style={{fontSize:12,fontWeight:600,color:'#9BAFC8',marginBottom:4}}>
          {time.toLocaleDateString('en-GB',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
        </div>
        <h1 style={{fontSize:'1.625rem',fontWeight:800,color:'#0A1628',letterSpacing:'-0.03em',marginBottom:4}}>
          Good morning, Jaime 👋
        </h1>
        <p style={{fontSize:14,color:'#7D8FA9'}}>Here's your market overview for today.</p>
      </div>

      {/* Market metrics ticker */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12,marginBottom:28}}>
        {METRICS.map(m => (
          <div key={m.label} className="card" style={{padding:'14px 16px'}}>
            <div style={{fontSize:11,fontWeight:600,color:'#9BAFC8',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>{m.label}</div>
            <div style={{fontSize:17,fontWeight:800,color:'#0A1628',marginBottom:3}}>{m.value}</div>
            <div style={{fontSize:12,fontWeight:600,color:m.pos?'#059669':'#DC2626'}}>{m.chg}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:20,marginBottom:20}}>
        {/* Quick access */}
        <div className="card" style={{padding:24}}>
          <div style={{fontSize:13,fontWeight:700,color:'#0A1628',marginBottom:16}}>Quick Access</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {QUICK_LINKS.map(l => (
              <Link key={l.href} href={l.href} style={{
                display:'flex',alignItems:'flex-start',gap:12,padding:'14px 16px',borderRadius:10,
                border:'1.5px solid #E2E8F2',textDecoration:'none',background:'#fff',
                transition:'all 0.14s',
              }}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='#1B4FFF';(e.currentTarget as HTMLElement).style.background='#F5F8FF'}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='#E2E8F2';(e.currentTarget as HTMLElement).style.background='#fff'}}>
                <span style={{fontSize:20,flexShrink:0,marginTop:1}}>{l.icon}</span>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:'#1C2B4A',marginBottom:2}}>{l.label}</div>
                  <div style={{fontSize:11,color:'#9BAFC8',lineHeight:1.4}}>{l.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent / Watchlist */}
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid #E2E8F2',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:13,fontWeight:700,color:'#0A1628'}}>Recent Lookups</span>
            <Link href="/app/watchlist" style={{fontSize:12,color:'#1B4FFF',textDecoration:'none',fontWeight:600}}>View all →</Link>
          </div>
          {RECENT.map((r,i) => (
            <Link key={r.symbol} href={`/app/company/${r.symbol}`} style={{
              display:'flex',alignItems:'center',gap:12,padding:'12px 18px',
              borderBottom:i<RECENT.length-1?'1px solid #F0F4FA':'none',
              textDecoration:'none',background:'#fff',transition:'background 0.12s',
            }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#F8FAFD'}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='#fff'}>
              <div style={{width:36,height:36,borderRadius:8,background:'#F0F4FA',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#1C2B4A',flexShrink:0}}>{r.symbol.slice(0,2)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:'#0A1628'}}>{r.symbol}</div>
                <div style={{fontSize:11,color:'#9BAFC8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:14,fontWeight:700,color:'#0A1628'}}>${r.price.toFixed(2)}</div>
                <div style={{fontSize:11,fontWeight:600,color:r.chg>=0?'#059669':'#DC2626'}}>{r.chg>=0?'+':''}{r.pct.toFixed(2)}%</div>
              </div>
              <ResponsiveContainer width={60} height={32}>
                <AreaChart data={genSpark(r.price).map((v,i)=>({v,i}))}>
                  <defs><linearGradient id={`sg${r.symbol}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={r.chg>=0?'#059669':'#DC2626'} stopOpacity={0.25}/>
                    <stop offset="95%" stopColor={r.chg>=0?'#059669':'#DC2626'} stopOpacity={0}/>
                  </linearGradient></defs>
                  <Area type="monotone" dataKey="v" stroke={r.chg>=0?'#059669':'#DC2626'} strokeWidth={1.5} fill={`url(#sg${r.symbol})`} dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </Link>
          ))}
        </div>
      </div>

      {/* Bottom row */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:20}}>
        {/* News snippet */}
        <div className="card" style={{padding:20}}>
          <div style={{fontSize:13,fontWeight:700,color:'#0A1628',marginBottom:14,display:'flex',justifyContent:'space-between'}}>
            <span>Latest Headlines</span>
            <Link href="/app/news" style={{fontSize:12,color:'#1B4FFF',textDecoration:'none',fontWeight:600}}>All news →</Link>
          </div>
          {[
            'Fed holds rates steady, signals two cuts in 2025',
            'NVIDIA beats estimates, raises full-year guidance',
            'European markets rally on ECB rate outlook',
          ].map((h,i) => (
            <div key={i} style={{padding:'10px 0',borderBottom:i<2?'1px solid #F0F4FA':'none',fontSize:13,color:'#1C2B4A',lineHeight:1.45,cursor:'pointer'}}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='#1B4FFF'}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='#1C2B4A'}>{h}</div>
          ))}
        </div>

        {/* Earnings this week */}
        <div className="card" style={{padding:20}}>
          <div style={{fontSize:13,fontWeight:700,color:'#0A1628',marginBottom:14,display:'flex',justifyContent:'space-between'}}>
            <span>Earnings This Week</span>
            <Link href="/app/news" style={{fontSize:12,color:'#1B4FFF',textDecoration:'none',fontWeight:600}}>Calendar →</Link>
          </div>
          {[
            { symbol:'GOOG',  date:'Mon', est:'$1.89', timing:'AMC' },
            { symbol:'META',  date:'Wed', est:'$4.32', timing:'AMC' },
            { symbol:'AMZN',  date:'Thu', est:'$0.84', timing:'AMC' },
          ].map((e,i) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:i<2?'1px solid #F0F4FA':'none'}}>
              <div style={{width:36,height:36,borderRadius:8,background:'#F0F4FA',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:'#1C2B4A',flexShrink:0}}>{e.symbol.slice(0,2)}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:'#0A1628'}}>{e.symbol}</div>
                <div style={{fontSize:11,color:'#9BAFC8'}}>{e.date} · Est. EPS {e.est}</div>
              </div>
              <span className="badge badge-blue" style={{fontSize:10}}>{e.timing}</span>
            </div>
          ))}
        </div>

        {/* AI prompt box */}
        <div className="card" style={{padding:20,display:'flex',flexDirection:'column'}}>
          <div style={{fontSize:13,fontWeight:700,color:'#0A1628',marginBottom:14}}>Ask Finsyt AI</div>
          <div style={{flex:1,display:'flex',flexDirection:'column',gap:8}}>
            {['What drove NVDA earnings?','Compare AAPL vs MSFT margins','Explain this 10-K risk factor'].map((q,i) => (
              <Link key={i} href={`/app/research?q=${encodeURIComponent(q)}`}
                style={{display:'block',padding:'10px 12px',borderRadius:8,background:'#F5F7FB',border:'1px solid #E2E8F2',fontSize:12,color:'#3D4F6E',textDecoration:'none',cursor:'pointer',transition:'all 0.12s'}}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#EEF3FF';(e.currentTarget as HTMLElement).style.borderColor='#1B4FFF';(e.currentTarget as HTMLElement).style.color='#1B4FFF'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#F5F7FB';(e.currentTarget as HTMLElement).style.borderColor='#E2E8F2';(e.currentTarget as HTMLElement).style.color='#3D4F6E'}}>
                "{q}"
              </Link>
            ))}
          </div>
          <Link href="/app/research" className="btn btn-primary" style={{display:'flex',justifyContent:'center',marginTop:14,fontSize:13}}>Open AI Research →</Link>
        </div>
      </div>
    </div>
  )
}

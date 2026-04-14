'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'

interface WatchItem { symbol:string; name:string; price:number; change:number; changePct:number; marketCap:number; volume:number; high52w:number; low52w:number; spark?:number[] }

const DEFAULT_SYMBOLS = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','JPM','V','LLY']

function Sparkline({data,pos}:{data:number[];pos:boolean}) {
  if(!data?.length) return <div style={{width:80,height:28}}/>
  return (
    <ResponsiveContainer width={80} height={28}>
      <AreaChart data={data.map((v,i)=>({v,i}))}>
        <defs><linearGradient id={`wsg${pos?'g':'r'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor={pos?'#059669':'#DC2626'} stopOpacity={0.25}/>
          <stop offset="95%" stopColor={pos?'#059669':'#DC2626'} stopOpacity={0}/>
        </linearGradient></defs>
        <Area type="monotone" dataKey="v" stroke={pos?'#059669':'#DC2626'} strokeWidth={1.5} fill={`url(#wsg${pos?'g':'r'})`} dot={false}/>
      </AreaChart>
    </ResponsiveContainer>
  )
}

function fmt(n:any,dp=2){return n==null||isNaN(n)?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:dp,maximumFractionDigits:dp})}
function fmtLarge(n:any){if(!n)return'—';const v=Number(n);if(v>=1e12)return'$'+(v/1e12).toFixed(2)+'T';if(v>=1e9)return'$'+(v/1e9).toFixed(1)+'B';return'$'+(v/1e6).toFixed(0)+'M'}

const FALLBACK:WatchItem[]=[
  {symbol:'AAPL',name:'Apple Inc.',            price:173.50,change:1.24, changePct:0.72, marketCap:2.7e12,volume:58e6, high52w:198.23,low52w:143.90,spark:[165,167,169,168,170,171,172,173,172,174]},
  {symbol:'MSFT',name:'Microsoft Corp.',        price:415.80,change:-2.10,changePct:-0.50,marketCap:3.1e12,volume:22e6, high52w:468.35,low52w:309.45,spark:[420,418,416,419,417,415,416,414,415,416]},
  {symbol:'NVDA',name:'NVIDIA Corporation',     price:878.40,change:12.30,changePct:1.42, marketCap:2.2e12,volume:42e6, high52w:974.00,low52w:463.09,spark:[840,850,855,848,860,865,870,875,872,878]},
  {symbol:'GOOGL',name:'Alphabet Inc.',         price:170.30,change:0.65, changePct:0.38, marketCap:2.1e12,volume:18e6, high52w:193.31,low52w:130.67,spark:[167,168,169,169,170,170,171,170,170,170]},
  {symbol:'AMZN',name:'Amazon.com Inc.',        price:185.70,change:2.10, changePct:1.15, marketCap:1.9e12,volume:31e6, high52w:201.20,low52w:118.35,spark:[178,180,181,183,184,184,185,185,184,186]},
  {symbol:'META',name:'Meta Platforms',         price:493.50,change:4.60, changePct:0.94, marketCap:1.3e12,volume:14e6, high52w:531.49,low52w:279.40,spark:[480,484,487,488,490,491,492,493,492,494]},
  {symbol:'TSLA',name:'Tesla Inc.',             price:175.20,change:-4.80,changePct:-2.66,marketCap:5.6e11,volume:95e6, high52w:299.29,low52w:138.80,spark:[185,182,180,181,179,178,176,177,175,175]},
  {symbol:'JPM', name:'JPMorgan Chase',         price:195.80,change:0.65, changePct:0.33, marketCap:5.7e11,volume:9e6,  high52w:221.60,low52w:135.19,spark:[193,194,195,195,196,196,195,196,196,196]},
  {symbol:'V',   name:'Visa Inc.',              price:275.60,change:0.57, changePct:0.21, marketCap:5.5e11,volume:5e6,  high52w:290.96,low52w:227.43,spark:[273,274,274,275,275,276,275,276,276,276]},
  {symbol:'LLY', name:'Eli Lilly',              price:735.40,change:11.10,changePct:1.53, marketCap:7.0e11,volume:3e6,  high52w:888.33,low52w:536.77,spark:[718,720,724,726,728,730,732,733,734,735]},
]

export default function WatchlistPage() {
  const [items, setItems]           = useState<WatchItem[]>(FALLBACK)
  const [loading, setLoading]       = useState(false)
  const [sortBy, setSortBy]         = useState<keyof WatchItem>('marketCap')
  const [sortDir, setSortDir]       = useState<'asc'|'desc'>('desc')
  const [addInput, setAddInput]     = useState('')
  const [lastUpdate, setLastUpdate] = useState<Date|null>(null)

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/quote?symbols='+DEFAULT_SYMBOLS.join(','))
      const data = await res.json()
      if (data.quotes?.length) {
        setItems(data.quotes.map((q:any) => ({
          symbol:q.symbol, name:q.name||q.symbol, price:q.price||q.c||0,
          change:q.change||q.d||0, changePct:q.changePct||q.dp||0,
          marketCap:q.marketCap||0, volume:q.volume||0,
          high52w:q.high52w||q['52WeekHigh']||0, low52w:q.low52w||q['52WeekLow']||0,
          spark:q.spark||[],
        })))
        setLastUpdate(new Date())
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(()=>{ load(); const id=setInterval(load,60000); return()=>clearInterval(id) },[load])

  function toggleSort(col:keyof WatchItem){
    if(sortBy===col) setSortDir(d=>d==='desc'?'asc':'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const sorted = [...items].sort((a,b)=>{
    const av=a[sortBy] as number,bv=b[sortBy] as number
    return sortDir==='desc'?bv-av:av-bv
  })

  const Th = ({col,label,right}:{col:keyof WatchItem;label:string;right?:boolean}) => (
    <th className={right?'right':''} onClick={()=>toggleSort(col)} style={{cursor:'pointer',userSelect:'none',whiteSpace:'nowrap'}}>
      {label} {sortBy===col?(sortDir==='desc'?'↓':'↑'):''}
    </th>
  )

  // Range bar helper
  function RangeBar({price,low,high}:{price:number;low:number;high:number}){
    if(!low||!high||price<low)return <div style={{width:100}}/>
    const pct=((price-low)/(high-low))*100
    return (
      <div style={{width:100}}>
        <div style={{height:4,borderRadius:2,background:'#E2E8F2',position:'relative'}}>
          <div style={{position:'absolute',left:0,top:0,height:'100%',width:pct+'%',borderRadius:2,background:'linear-gradient(90deg,#DC2626,#059669)'}}/>
          <div style={{position:'absolute',top:-3,left:pct+'%',width:10,height:10,borderRadius:'50%',background:'#0A1628',border:'2px solid #fff',transform:'translateX(-50%)'}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'#9BAFC8',marginTop:3}}>
          <span>${fmt(low,0)}</span><span>${fmt(high,0)}</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{padding:'1.75rem',maxWidth:1400,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 className="page-title">Watchlist</h1>
          <p style={{fontSize:13,color:'#9BAFC8',marginTop:3}}>Live prices · Auto-refreshes every 60s</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {lastUpdate && <span style={{fontSize:12,color:'#9BAFC8'}}>Updated {lastUpdate.toLocaleTimeString()}</span>}
          <div style={{display:'flex',gap:0,borderRadius:8,overflow:'hidden',border:'1.5px solid #E2E8F2'}}>
            <input value={addInput} onChange={e=>setAddInput(e.target.value.toUpperCase())} placeholder="Add ticker..." maxLength={6}
              style={{width:110,padding:'7px 12px',border:'none',fontSize:13,fontFamily:'inherit',color:'#0A1628',outline:'none',background:'#fff'}}/>
            <button onClick={()=>{ if(addInput.trim()&&!items.find(i=>i.symbol===addInput)) setAddInput('') }} className="btn btn-primary" style={{borderRadius:0,padding:'7px 14px',fontSize:13}}>+</button>
          </div>
          <button onClick={load} className="btn btn-outline btn-sm">↻</button>
        </div>
      </div>

      {/* Summary row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        {[
          {l:'Total Holdings', v:items.length+' stocks'},
          {l:'Gaining Today',  v:items.filter(i=>i.changePct>0).length+' stocks', color:'#059669'},
          {l:'Losing Today',   v:items.filter(i=>i.changePct<0).length+' stocks', color:'#DC2626'},
          {l:'Top Gainer',     v:items.reduce((a,b)=>a.changePct>b.changePct?a:b,items[0])?.symbol||'—', color:'#059669'},
        ].map(m=>(
          <div key={m.l} className="card" style={{padding:'14px 16px'}}>
            <div style={{fontSize:11,fontWeight:600,color:'#9BAFC8',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:5}}>{m.l}</div>
            <div style={{fontSize:16,fontWeight:800,color:m.color||'#0A1628'}}>{m.v}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <div style={{overflowX:'auto'}}>
          <table className="data-table">
            <thead>
              <tr>
                <Th col="symbol"    label="Symbol"/>
                <Th col="price"     label="Price"    right/>
                <Th col="changePct" label="Chg %"    right/>
                <Th col="marketCap" label="Mkt Cap"  right/>
                <Th col="volume"    label="Volume"   right/>
                <th>7-Day Trend</th>
                <th>52W Range</th>
                <th/>
              </tr>
            </thead>
            <tbody>
              {sorted.map(s=>(
                <tr key={s.symbol}>
                  <td>
                    <Link href={`/app/company/${s.symbol}`} style={{textDecoration:'none',display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:36,height:36,borderRadius:8,background:'#F0F4FA',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#1C2B4A',flexShrink:0}}>{s.symbol.slice(0,2)}</div>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:'#0A1628'}}>{s.symbol}</div>
                        <div style={{fontSize:11,color:'#9BAFC8',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="right" style={{fontWeight:800,fontSize:15,color:'#0A1628'}}>${fmt(s.price)}</td>
                  <td className={`right ${s.changePct>=0?'pos':'neg'}`} style={{fontWeight:700,fontSize:14}}>
                    {s.changePct>=0?'+':''}{s.changePct?.toFixed(2)}%
                    <div style={{fontSize:11,fontWeight:500,color:'#9BAFC8'}}>{s.change>=0?'+':''}{fmt(s.change)}</div>
                  </td>
                  <td className="right" style={{color:'#1C2B4A'}}>{fmtLarge(s.marketCap)}</td>
                  <td className="right" style={{color:'#1C2B4A'}}>{s.volume?(s.volume/1e6).toFixed(1)+'M':'—'}</td>
                  <td><Sparkline data={s.spark||[]} pos={s.changePct>=0}/></td>
                  <td><RangeBar price={s.price} low={s.low52w} high={s.high52w}/></td>
                  <td>
                    <div style={{display:'flex',gap:6}}>
                      <Link href={`/app/company/${s.symbol}`} className="btn btn-outline btn-sm">View</Link>
                      <Link href={`/app/research?q=Analyze ${s.symbol}`} className="btn btn-ghost btn-sm">AI</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

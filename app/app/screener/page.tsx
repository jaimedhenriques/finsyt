'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Stock { symbol:string; name:string; price:number; changePct:number; marketCap:number; peRatio:number; sector:string; volume:number; exchange:string }

const SECTORS = ['All','Technology','Healthcare','Financials','Energy','Consumer Disc.','Industrials','Utilities','Materials','Communication','Real Estate']
const EXCHANGES = ['All','NYSE','NASDAQ','LSE','TSX']

function fmt(n:number,dp=2){return n==null?'—':n.toLocaleString('en-US',{minimumFractionDigits:dp,maximumFractionDigits:dp})}
function fmtB(n:number){
  if(!n)return'—'
  if(n>=1e12)return`$${(n/1e12).toFixed(2)}T`
  if(n>=1e9)return`$${(n/1e9).toFixed(1)}B`
  if(n>=1e6)return`$${(n/1e6).toFixed(0)}M`
  return`$${n.toLocaleString()}`
}

const FALLBACK:Stock[]=[
  {symbol:'AAPL',name:'Apple Inc.',             price:173.50,changePct:0.72,  marketCap:2.7e12,peRatio:28.4,sector:'Technology',    volume:58e6, exchange:'NASDAQ'},
  {symbol:'MSFT',name:'Microsoft Corp.',         price:415.80,changePct:-0.50,marketCap:3.1e12,peRatio:35.2,sector:'Technology',    volume:22e6, exchange:'NASDAQ'},
  {symbol:'NVDA',name:'NVIDIA Corporation',      price:878.40,changePct:1.42, marketCap:2.2e12,peRatio:68.1,sector:'Technology',    volume:42e6, exchange:'NASDAQ'},
  {symbol:'GOOGL',name:'Alphabet Inc.',          price:170.30,changePct:0.38, marketCap:2.1e12,peRatio:23.5,sector:'Communication',  volume:18e6, exchange:'NASDAQ'},
  {symbol:'AMZN',name:'Amazon.com Inc.',         price:185.70,changePct:1.15, marketCap:1.9e12,peRatio:43.7,sector:'Consumer Disc.', volume:31e6, exchange:'NASDAQ'},
  {symbol:'META',name:'Meta Platforms',          price:493.50,changePct:0.94, marketCap:1.3e12,peRatio:26.4,sector:'Communication',  volume:14e6, exchange:'NASDAQ'},
  {symbol:'TSLA',name:'Tesla Inc.',              price:175.20,changePct:-2.66,marketCap:5.6e11,peRatio:48.9,sector:'Consumer Disc.', volume:95e6, exchange:'NASDAQ'},
  {symbol:'JPM',name:'JPMorgan Chase',           price:195.80,changePct:0.33, marketCap:5.7e11,peRatio:11.2,sector:'Financials',    volume:9e6,  exchange:'NYSE'},
  {symbol:'LLY', name:'Eli Lilly',               price:735.40,changePct:1.52, marketCap:6.98e11,peRatio:55.1,sector:'Healthcare',   volume:3e6,  exchange:'NYSE'},
  {symbol:'V',   name:'Visa Inc.',               price:275.60,changePct:0.21, marketCap:5.5e11,peRatio:29.8,sector:'Financials',    volume:5e6,  exchange:'NYSE'},
  {symbol:'XOM', name:'ExxonMobil Corp.',        price:112.40,changePct:-0.82,marketCap:4.5e11,peRatio:13.4,sector:'Energy',        volume:16e6, exchange:'NYSE'},
  {symbol:'WMT', name:'Walmart Inc.',            price:62.30, changePct:0.44, marketCap:5.0e11,peRatio:27.2,sector:'Consumer Disc.',volume:8e6,  exchange:'NYSE'},
]

export default function ScreenerPage() {
  const [stocks, setStocks]       = useState<Stock[]>(FALLBACK)
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [sector, setSector]       = useState('All')
  const [exchange, setExchange]   = useState('All')
  const [minMcap, setMinMcap]     = useState('')
  const [maxPE, setMaxPE]         = useState('')
  const [minChg, setMinChg]       = useState('')
  const [sortBy, setSortBy]       = useState<keyof Stock>('marketCap')
  const [sortDir, setSortDir]     = useState<'asc'|'desc'>('desc')

  useEffect(() => {
    setLoading(true)
    fetch('/api/screener?limit=50')
      .then(r=>r.json())
      .then(d=>{ if(d.results?.length) setStocks(d.results) })
      .catch(()=>{})
      .finally(()=>setLoading(false))
  }, [])

  const filtered = stocks
    .filter(s => (!search || s.symbol.includes(search.toUpperCase()) || s.name.toLowerCase().includes(search.toLowerCase())))
    .filter(s => sector==='All' || s.sector===sector)
    .filter(s => exchange==='All' || s.exchange===exchange)
    .filter(s => !minMcap || s.marketCap >= parseFloat(minMcap)*1e9)
    .filter(s => !maxPE   || s.peRatio   <= parseFloat(maxPE))
    .filter(s => !minChg  || s.changePct >= parseFloat(minChg))
    .sort((a,b) => {
      const av = a[sortBy] as number, bv = b[sortBy] as number
      return sortDir==='desc' ? bv-av : av-bv
    })

  function toggleSort(col: keyof Stock) {
    if(sortBy===col) setSortDir(d=>d==='desc'?'asc':'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const Th = ({col,label,right}:{col:keyof Stock;label:string;right?:boolean}) => (
    <th className={right?'right':''} onClick={()=>toggleSort(col)} style={{cursor:'pointer',userSelect:'none',whiteSpace:'nowrap'}}>
      {label} {sortBy===col ? (sortDir==='desc'?'↓':'↑') : ''}
    </th>
  )

  return (
    <div style={{padding:'1.75rem',maxWidth:1400,margin:'0 auto'}}>
      <div style={{marginBottom:24}}>
        <h1 className="page-title">Stock Screener</h1>
        <p style={{fontSize:13,color:'#9BAFC8',marginTop:3}}>Filter across 70,000+ global securities</p>
      </div>

      {/* Filters */}
      <div className="card" style={{padding:20,marginBottom:20}}>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr',gap:12,alignItems:'end'}}>
          <div>
            <label style={{fontSize:11,fontWeight:600,color:'#9BAFC8',display:'block',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Search</label>
            <input className="input" placeholder="Ticker or company name..." value={search} onChange={e=>setSearch(e.target.value)} style={{fontSize:13}}/>
          </div>
          <div>
            <label style={{fontSize:11,fontWeight:600,color:'#9BAFC8',display:'block',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Sector</label>
            <select className="input" value={sector} onChange={e=>setSector(e.target.value)} style={{fontSize:13}}>
              {SECTORS.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:11,fontWeight:600,color:'#9BAFC8',display:'block',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Exchange</label>
            <select className="input" value={exchange} onChange={e=>setExchange(e.target.value)} style={{fontSize:13}}>
              {EXCHANGES.map(e=><option key={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:11,fontWeight:600,color:'#9BAFC8',display:'block',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Min Mkt Cap ($B)</label>
            <input className="input" placeholder="e.g. 10" type="number" value={minMcap} onChange={e=>setMinMcap(e.target.value)} style={{fontSize:13}}/>
          </div>
          <div>
            <label style={{fontSize:11,fontWeight:600,color:'#9BAFC8',display:'block',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Max P/E</label>
            <input className="input" placeholder="e.g. 30" type="number" value={maxPE} onChange={e=>setMaxPE(e.target.value)} style={{fontSize:13}}/>
          </div>
          <div>
            <label style={{fontSize:11,fontWeight:600,color:'#9BAFC8',display:'block',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Min Chg %</label>
            <input className="input" placeholder="e.g. -5" type="number" value={minChg} onChange={e=>setMinChg(e.target.value)} style={{fontSize:13}}/>
          </div>
        </div>
        <div style={{marginTop:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:12,color:'#9BAFC8'}}>{filtered.length} results</span>
          <button className="btn btn-ghost btn-sm" onClick={()=>{setSearch('');setSector('All');setExchange('All');setMinMcap('');setMaxPE('');setMinChg('')}}>Clear filters</button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{overflow:'hidden'}}>
        <div style={{overflowX:'auto'}}>
          <table className="data-table">
            <thead>
              <tr>
                <Th col="symbol"    label="Symbol"/>
                <Th col="price"     label="Price"     right/>
                <Th col="changePct" label="Change %"  right/>
                <Th col="marketCap" label="Mkt Cap"   right/>
                <Th col="peRatio"   label="P/E"       right/>
                <Th col="volume"    label="Volume"     right/>
                <th>Sector</th><th>Exchange</th><th/>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s=>(
                <tr key={s.symbol}>
                  <td>
                    <Link href={`/app/company/${s.symbol}`} style={{textDecoration:'none'}}>
                      <div style={{fontWeight:700,color:'#0A1628'}}>{s.symbol}</div>
                      <div style={{fontSize:11,color:'#9BAFC8',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
                    </Link>
                  </td>
                  <td className="right" style={{fontWeight:700,fontSize:14}}>${fmt(s.price)}</td>
                  <td className={`right ${s.changePct>=0?'pos':'neg'}`} style={{fontWeight:700}}>{s.changePct>=0?'+':''}{s.changePct?.toFixed(2)}%</td>
                  <td className="right" style={{color:'#1C2B4A'}}>{fmtB(s.marketCap)}</td>
                  <td className="right" style={{color:'#1C2B4A'}}>{s.peRatio?fmt(s.peRatio,1):'—'}</td>
                  <td className="right" style={{color:'#1C2B4A'}}>{s.volume?(s.volume/1e6).toFixed(1)+'M':'—'}</td>
                  <td><span className="badge badge-gray">{s.sector||'—'}</span></td>
                  <td><span style={{fontSize:12,color:'#9BAFC8'}}>{s.exchange}</span></td>
                  <td>
                    <Link href={`/app/company/${s.symbol}`} className="btn btn-outline btn-sm">View →</Link>
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

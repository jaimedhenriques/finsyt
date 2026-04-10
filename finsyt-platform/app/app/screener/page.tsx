'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fmtLarge, fmtPct, fmt, changeClass } from '@/lib/utils'

const SECTORS = ['','Technology','Financials','Healthcare','Energy','Consumer Disc.','Consumer Staples']

export default function Screener() {
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sector, setSector] = useState('')
  const [minMcap, setMinMcap] = useState('')
  const [maxPE, setMaxPE] = useState('')
  const [sort, setSort] = useState<{key:string;dir:1|-1}>({key:'mcap',dir:-1})

  useEffect(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (sector) p.set('sector',sector)
    if (minMcap) p.set('minMcap',String(parseFloat(minMcap)*1e9))
    if (maxPE) p.set('maxPE',maxPE)
    fetch('/api/screener?'+p).then(r=>r.json()).then(d=>{setResults(d.results||[]);setLoading(false)})
  }, [sector,minMcap,maxPE])

  const sorted = [...results].sort((a,b)=>{const av=a[sort.key]??0,bv=b[sort.key]??0;return(av<bv?-1:av>bv?1:0)*sort.dir})
  const toggleSort = (key:string) => setSort(prev=>({key,dir:prev.key===key?(prev.dir===1?-1:1):-1}))
  const SortIcon = ({k}:{k:string}) => <span style={{color:sort.key===k?'#1B4FFF':'#C5CFDF',marginLeft:4}}>{sort.key===k?(sort.dir===-1?'↓':'↑'):'↕'}</span>

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="page-title">Stock Screener</h1><p className="text-sm mt-0.5" style={{color:'#7D8FA9'}}>Filter and rank equities</p></div>
        <span className="badge badge-blue">{results.length} results</span>
      </div>
      <div className="card p-4 mb-5">
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:16,alignItems:'end'}}>
          <div><label className="label" style={{display:'block',marginBottom:6}}>Sector</label>
            <select className="input" value={sector} onChange={e=>setSector(e.target.value)}>
              {SECTORS.map(s=><option key={s} value={s}>{s||'All Sectors'}</option>)}
            </select></div>
          <div><label className="label" style={{display:'block',marginBottom:6}}>Min Market Cap ($B)</label>
            <input className="input" type="number" placeholder="e.g. 100" value={minMcap} onChange={e=>setMinMcap(e.target.value)} /></div>
          <div><label className="label" style={{display:'block',marginBottom:6}}>Max P/E Ratio</label>
            <input className="input" type="number" placeholder="e.g. 30" value={maxPE} onChange={e=>setMaxPE(e.target.value)} /></div>
          <button onClick={()=>{setSector('');setMinMcap('');setMaxPE('')}} className="btn btn-outline">Reset</button>
        </div>
      </div>
      <div className="card overflow-hidden">
        <div style={{overflowX:'auto'}}>
          <table className="data-table">
            <thead><tr>
              <th style={{cursor:'pointer'}} onClick={()=>toggleSort('symbol')}>Ticker <SortIcon k="symbol" /></th>
              <th>Company</th><th>Sector</th>
              <th className="right" style={{cursor:'pointer'}} onClick={()=>toggleSort('price')}>Price <SortIcon k="price" /></th>
              <th className="right" style={{cursor:'pointer'}} onClick={()=>toggleSort('change')}>Chg% <SortIcon k="change" /></th>
              <th className="right" style={{cursor:'pointer'}} onClick={()=>toggleSort('mcap')}>Mkt Cap <SortIcon k="mcap" /></th>
              <th className="right" style={{cursor:'pointer'}} onClick={()=>toggleSort('pe')}>P/E <SortIcon k="pe" /></th>
              <th className="right" style={{cursor:'pointer'}} onClick={()=>toggleSort('eps')}>EPS <SortIcon k="eps" /></th>
              <th></th>
            </tr></thead>
            <tbody>
              {loading ? [...Array(8)].map((_,i)=><tr key={i}>{[...Array(9)].map((_,j)=><td key={j}><div className="skeleton" style={{height:14,width:'100%'}} /></td>)}</tr>) :
              sorted.map((r,i)=>(
                <tr key={i} style={{cursor:'pointer'}} onClick={()=>window.location.href=`/app/company/${r.symbol}`}>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:28,height:28,borderRadius:7,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontWeight:900}}>{r.symbol[0]}</div>
                      <span style={{fontWeight:700,fontSize:13,color:'#1B4FFF'}}>{r.symbol}</span>
                    </div>
                  </td>
                  <td style={{fontSize:13,color:'#1C2B4A',maxWidth:200}}><span style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</span></td>
                  <td><span className="badge badge-gray">{r.sector}</span></td>
                  <td className="right" style={{fontWeight:600,fontSize:13}}>${fmt(r.price)}</td>
                  <td className={`right ${changeClass(r.change)}`} style={{fontSize:13}}>{fmtPct(r.change)}</td>
                  <td className="right" style={{fontSize:13,color:'#3D4F6E'}}>{fmtLarge(r.mcap)}</td>
                  <td className="right" style={{fontSize:13,color:'#3D4F6E'}}>{r.pe>0?`${fmt(r.pe)}x`:'—'}</td>
                  <td className="right" style={{fontSize:13,color:'#3D4F6E'}}>{r.eps>0?`$${fmt(r.eps)}`:'—'}</td>
                  <td><Link href={`/app/company/${r.symbol}`} onClick={e=>e.stopPropagation()} className="btn btn-ghost btn-sm">View →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

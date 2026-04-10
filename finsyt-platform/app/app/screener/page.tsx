'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fmtLarge, fmtPct, fmt, changeClass } from '@/lib/utils'

const SECTORS = ['','Technology','Financials','Healthcare','Energy','Consumer Disc.','Consumer Staples','Industrials','Utilities']

const MA_DEALS = [
  {buyer:'Microsoft',target:'Activision Blizzard',value:68.7e9,funding:'N/A',stage:'Acquisition',date:'2023-10-13',sector:'Technology',status:'Closed',aiNote:'Strategic acquisition to boost gaming and metaverse content pipeline. Significant for Xbox Game Pass subscriber growth.'},
  {buyer:'Broadcom',target:'VMware',value:69e9,funding:'N/A',stage:'Acquisition',date:'2023-11-22',sector:'Technology',status:'Closed',aiNote:'Diversification into enterprise software. VMware brings $4B+ recurring revenue and 300k+ enterprise customers.'},
  {buyer:'Capital One',target:'Discover Financial',value:35.3e9,funding:'N/A',stage:'Acquisition',date:'2024-02-19',sector:'Financials',status:'Pending',aiNote:'Creates 6th largest US bank. Discover network gives Capital One proprietary payment rail and $100B card portfolio.'},
  {buyer:'Synopsys',target:'Ansys',value:35e9,funding:'N/A',stage:'Acquisition',date:'2024-01-16',sector:'Technology',status:'Pending',aiNote:'Creates combined EDA + simulation giant serving semiconductor and aerospace sectors.'},
  {buyer:'Mars',target:'Kellanova',value:36e9,funding:'N/A',stage:'Acquisition',date:'2024-08-14',sector:'Consumer Staples',status:'Closed',aiNote:'Transforms Mars into top-3 global confectionery. Pringles and Cheez-It brands add significant US snack market share.'},
  {buyer:'HP Enterprise',target:'Juniper Networks',value:14e9,funding:'N/A',stage:'Acquisition',date:'2024-01-09',sector:'Technology',status:'Pending',aiNote:'Accelerates AI networking capabilities. Juniper Mist AI platform enhances HPE cloud networking portfolio.'},
]

const FUNDING_DEALS = [
  {company:'OpenAI',investor:'Microsoft, Thrive Capital',value:6.6e9,stage:'Late Stage VC',date:'2024-10-02',sector:'AI/Technology',status:'Completed',aiNote:'Valuation at $157B post-money. Funds GPT-5 training compute and international expansion.'},
  {company:'Stripe',investor:'Sequoia, Andreessen',value:6.5e9,stage:'Late Stage VC',date:'2024-02-15',sector:'Fintech',status:'Completed',aiNote:'Valuation at $65B. Funds global expansion and enterprise payment infrastructure buildout.'},
  {company:'Databricks',investor:'Andreessen, ICONIQ',value:10e9,stage:'Late Stage VC (Series J)',date:'2024-09-25',sector:'Data/AI',status:'Completed',aiNote:'Largest private tech raise of 2024 at $62B valuation. Positions company for IPO in 2025.'},
  {company:'xAI (Grok)',investor:'Andreessen, Sequoia',value:6e9,stage:'Series B',date:'2024-05-25',sector:'AI',status:'Completed',aiNote:'Elon Musk AI venture at $24B valuation. Competes directly with OpenAI and Anthropic.'},
  {company:'Anthropic',investor:'Amazon, Google',value:4e9,stage:'Late Stage VC',date:'2024-03-22',sector:'AI',status:'Completed',aiNote:'Amazon deepens strategic bet on Claude models. Total funding now $7.3B with $20B+ valuation.'},
  {company:'Waymo',investor:'Alphabet, Tiger Global',value:5.6e9,stage:'Late Stage VC',date:'2024-10-25',sector:'Autonomous Vehicles',status:'Completed',aiNote:'Funds expansion to 10+ US cities. Operating 100k+ paid rides/week in SF and Phoenix.'},
]

export default function Screener() {
  const [mainTab, setMainTab] = useState<'equities'|'ma'|'funding'>('equities')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sector, setSector] = useState('')
  const [minMcap, setMinMcap] = useState('')
  const [maxPE, setMaxPE] = useState('')
  const [sort, setSort] = useState<{key:string;dir:1|-1}>({key:'mcap',dir:-1})
  const [expanded, setExpanded] = useState<number|null>(null)

  useEffect(() => {
    if (mainTab!=='equities') return
    setLoading(true)
    const p = new URLSearchParams()
    if (sector) p.set('sector',sector)
    if (minMcap) p.set('minMcap',String(parseFloat(minMcap)*1e9))
    if (maxPE) p.set('maxPE',maxPE)
    fetch('/api/screener?'+p).then(r=>r.json()).then(d=>{setResults(d.results||[]);setLoading(false)})
  }, [sector,minMcap,maxPE,mainTab])

  const sorted = [...results].sort((a,b)=>{const av=a[sort.key]??0,bv=b[sort.key]??0;return(av<bv?-1:av>bv?1:0)*sort.dir})
  const toggleSort = (key:string) => setSort(prev=>({key,dir:prev.key===key?(prev.dir===1?-1:1):-1}))
  const SortIcon = ({k}:{k:string}) => <span style={{color:sort.key===k?'#1B4FFF':'#C5CFDF',marginLeft:4}}>{sort.key===k?(sort.dir===-1?'↓':'↑'):'↕'}</span>

  return (
    <div className="page-content">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 className="page-title">Screener</h1>
          <p style={{fontSize:13,marginTop:2,color:'#7D8FA9'}}>400+ filters across equities, M&A, and funding rounds</p>
        </div>
        {mainTab==='equities'&&<span className="badge badge-blue">{results.length} results</span>}
      </div>

      <div className="tab-bar" style={{marginBottom:20}}>
        <button className={`tab-btn ${mainTab==='equities'?'active':''}`} onClick={()=>setMainTab('equities')}>◈ Equities</button>
        <button className={`tab-btn ${mainTab==='ma'?'active':''}`} onClick={()=>setMainTab('ma')}>◳ Mergers & Acquisitions</button>
        <button className={`tab-btn ${mainTab==='funding'?'active':''}`} onClick={()=>setMainTab('funding')}>◎ Funding Rounds</button>
      </div>

      {mainTab==='equities' && (
        <>
          <div className="card" style={{padding:16,marginBottom:16}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:16,alignItems:'end'}}>
              <div><label className="label" style={{display:'block',marginBottom:6}}>Sector</label>
                <select className="input" value={sector} onChange={e=>setSector(e.target.value)}>
                  {SECTORS.map(s=><option key={s} value={s}>{s||'All Sectors'}</option>)}
                </select></div>
              <div><label className="label" style={{display:'block',marginBottom:6}}>Min Market Cap ($B)</label>
                <input className="input" type="number" placeholder="e.g. 100" value={minMcap} onChange={e=>setMinMcap(e.target.value)}/></div>
              <div><label className="label" style={{display:'block',marginBottom:6}}>Max P/E Ratio</label>
                <input className="input" type="number" placeholder="e.g. 30" value={maxPE} onChange={e=>setMaxPE(e.target.value)}/></div>
              <button onClick={()=>{setSector('');setMinMcap('');setMaxPE('')}} className="btn btn-outline">Reset</button>
            </div>
          </div>
          <div className="card" style={{overflow:'hidden'}}>
            <div style={{overflowX:'auto'}}>
              <table className="data-table">
                <thead><tr>
                  <th style={{cursor:'pointer'}} onClick={()=>toggleSort('symbol')}>Ticker <SortIcon k="symbol"/></th>
                  <th>Company</th><th>Sector</th>
                  <th className="right" style={{cursor:'pointer'}} onClick={()=>toggleSort('price')}>Price <SortIcon k="price"/></th>
                  <th className="right" style={{cursor:'pointer'}} onClick={()=>toggleSort('change')}>Chg% <SortIcon k="change"/></th>
                  <th className="right" style={{cursor:'pointer'}} onClick={()=>toggleSort('mcap')}>Mkt Cap <SortIcon k="mcap"/></th>
                  <th className="right" style={{cursor:'pointer'}} onClick={()=>toggleSort('pe')}>P/E <SortIcon k="pe"/></th>
                  <th className="right" style={{cursor:'pointer'}} onClick={()=>toggleSort('eps')}>EPS <SortIcon k="eps"/></th>
                  <th></th>
                </tr></thead>
                <tbody>
                  {loading?[...Array(8)].map((_,i)=><tr key={i}>{[...Array(9)].map((_,j)=><td key={j}><div className="skeleton" style={{height:14,width:'100%'}}/></td>)}</tr>):
                  sorted.map((r,i)=>(
                    <tr key={i} style={{cursor:'pointer'}} onClick={()=>window.location.href=`/app/company/${r.symbol}`}>
                      <td><div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:28,height:28,borderRadius:7,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontWeight:900}}>{r.symbol[0]}</div>
                        <span style={{fontWeight:700,fontSize:13,color:'#1B4FFF'}}>{r.symbol}</span>
                      </div></td>
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
        </>
      )}

      {mainTab==='ma' && (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:12,marginBottom:20}}>
            {[{l:'Total 2024 M&A',v:'$2.1T'},{l:'Largest Deal',v:'$69B'},{l:'Avg Premium',v:'34%'},{l:'Pending',v:'3'}].map(m=>(
              <div key={m.l} className="metric-card" style={{padding:'12px 16px'}}>
                <div className="label" style={{marginBottom:6}}>{m.l}</div>
                <div style={{fontWeight:900,fontSize:'1.25rem',color:'#0A1628',letterSpacing:'-0.02em'}}>{m.v}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{overflow:'hidden'}}>
            <div style={{overflowX:'auto'}}>
              <table className="data-table">
                <thead><tr><th>Acquirer</th><th>Target</th><th>Sector</th><th className="right">Deal Value</th><th>Stage</th><th>Date</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {MA_DEALS.map((d,i)=>(
                    <>
                      <tr key={i} style={{cursor:'pointer'}} onClick={()=>setExpanded(expanded===i?null:i)}>
                        <td style={{fontWeight:700,fontSize:13,color:'#0A1628'}}>{d.buyer}</td>
                        <td style={{fontSize:13,color:'#3D4F6E'}}>{d.target}</td>
                        <td><span className="badge badge-gray">{d.sector}</span></td>
                        <td className="right" style={{fontWeight:700,fontSize:13}}>{fmtLarge(d.value)}</td>
                        <td><span className="badge badge-blue">{d.stage}</span></td>
                        <td style={{fontSize:12,color:'#7D8FA9'}}>{d.date}</td>
                        <td><span className={`badge ${d.status==='Closed'?'badge-green':'badge-amber'}`}>{d.status}</span></td>
                        <td style={{fontSize:12,color:'#1B4FFF',fontWeight:600}}>{expanded===i?'▲ Hide AI':'▼ AI Summary'}</td>
                      </tr>
                      {expanded===i&&(
                        <tr key={`exp-${i}`}>
                          <td colSpan={8} style={{background:'#F8FAFD',padding:'12px 20px'}}>
                            <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
                              <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:10,fontWeight:900,flexShrink:0}}>AI</div>
                              <p style={{fontSize:13,color:'#3D4F6E',lineHeight:1.6,margin:0}}><strong>Finsyt AI:</strong> {d.aiNote}</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {mainTab==='funding' && (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:12,marginBottom:20}}>
            {[{l:'VC Raised 2024',v:'$340B'},{l:'AI Deals',v:'$89B'},{l:'Unicorns Added',v:'47'},{l:'Avg Series B',v:'$180M'}].map(m=>(
              <div key={m.l} className="metric-card" style={{padding:'12px 16px'}}>
                <div className="label" style={{marginBottom:6}}>{m.l}</div>
                <div style={{fontWeight:900,fontSize:'1.25rem',color:'#0A1628',letterSpacing:'-0.02em'}}>{m.v}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{overflow:'hidden'}}>
            <div style={{overflowX:'auto'}}>
              <table className="data-table">
                <thead><tr><th>Company</th><th>Lead Investors</th><th>Sector</th><th className="right">Amount</th><th>Stage</th><th>Date</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {FUNDING_DEALS.map((d,i)=>(
                    <>
                      <tr key={i} style={{cursor:'pointer'}} onClick={()=>setExpanded(expanded===i+100?null:i+100)}>
                        <td style={{fontWeight:700,fontSize:13,color:'#0A1628'}}>{d.company}</td>
                        <td style={{fontSize:12,color:'#7D8FA9',maxWidth:160}}><span style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.investor}</span></td>
                        <td><span className="badge badge-gray">{d.sector}</span></td>
                        <td className="right" style={{fontWeight:700,fontSize:13}}>{fmtLarge(d.value)}</td>
                        <td><span className="badge badge-blue" style={{fontSize:11}}>{d.stage}</span></td>
                        <td style={{fontSize:12,color:'#7D8FA9'}}>{d.date}</td>
                        <td><span className="badge badge-green">{d.status}</span></td>
                        <td style={{fontSize:12,color:'#1B4FFF',fontWeight:600}}>{expanded===i+100?'▲ Hide AI':'▼ AI Summary'}</td>
                      </tr>
                      {expanded===i+100&&(
                        <tr key={`expf-${i}`}>
                          <td colSpan={8} style={{background:'#F8FAFD',padding:'12px 20px'}}>
                            <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
                              <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:10,fontWeight:900,flexShrink:0}}>AI</div>
                              <p style={{fontSize:13,color:'#3D4F6E',lineHeight:1.6,margin:0}}><strong>Finsyt AI:</strong> {d.aiNote}</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

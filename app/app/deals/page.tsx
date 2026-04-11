'use client'
import { useState } from 'react'

type Deal = {
  type: 'M&A' | 'IPO' | 'Funding' | 'SPO'
  acquirer: string
  target?: string
  value: number
  status: 'Closed' | 'Pending' | 'Rumoured' | 'Withdrawn'
  date: string
  sector: string
  premium?: string
  investors?: string
  stage?: string
  aiNote?: string
}

const DEALS: Deal[] = [
  { type:'M&A',     acquirer:'Microsoft',         target:'Activision Blizzard', value:68.7e9, status:'Closed',   date:'2023-10-13', sector:'Technology',      premium:'45%', aiNote:'Strategic acquisition to boost gaming and metaverse content pipeline. Significant for Xbox Game Pass subscriber growth.' },
  { type:'M&A',     acquirer:'Broadcom',           target:'VMware',             value:69.0e9, status:'Closed',   date:'2023-11-22', sector:'Technology',      premium:'44%', aiNote:'Diversification into enterprise software. VMware brings $4B+ recurring revenue and 300k+ enterprise customers.' },
  { type:'M&A',     acquirer:'Capital One',        target:'Discover Financial', value:35.3e9, status:'Pending',  date:'2024-02-19', sector:'Financials',      premium:'27%', aiNote:'Creates 6th largest US bank. Discover network gives Capital One proprietary payment rail.' },
  { type:'M&A',     acquirer:'Synopsys',           target:'Ansys',              value:35.0e9, status:'Pending',  date:'2024-01-16', sector:'Technology',      premium:'35%', aiNote:'Creates combined EDA + simulation giant serving semiconductor and aerospace sectors.' },
  { type:'M&A',     acquirer:'Mars',               target:'Kellanova',          value:36.0e9, status:'Closed',   date:'2024-08-14', sector:'Consumer Staples', premium:'33%', aiNote:'Transforms Mars into top-3 global confectionery. Pringles and Cheez-It brands add significant US snack market share.' },
  { type:'M&A',     acquirer:'HP Enterprise',      target:'Juniper Networks',   value:14.0e9, status:'Closed',   date:'2024-01-09', sector:'Technology',      premium:'32%', aiNote:'Accelerates AI networking capabilities. Juniper Mist AI platform enhances HPE cloud networking portfolio.' },
  { type:'M&A',     acquirer:'Mastercard',         target:'Recorded Future',    value:2.65e9, status:'Closed',   date:'2024-09-12', sector:'Technology',      premium:'N/A', aiNote:'Expands Mastercard into AI-powered threat intelligence for fraud and cybersecurity.' },
  { type:'Funding', acquirer:'OpenAI',             investors:'Microsoft, Thrive',value:6.6e9, status:'Closed',  date:'2024-10-02', sector:'AI',               stage:'Late Stage', aiNote:'Valuation at $157B post-money. Funds GPT-5 training compute and international expansion.' },
  { type:'Funding', acquirer:'Anthropic',          investors:'Amazon, Google',   value:4.0e9, status:'Closed',  date:'2024-03-22', sector:'AI',               stage:'Late Stage', aiNote:'Amazon deepens strategic bet on Claude models. Total funding now $7.3B with $20B+ valuation.' },
  { type:'Funding', acquirer:'Databricks',         investors:'Andreessen, ICONIQ',value:10e9, status:'Closed', date:'2024-09-25', sector:'Data/AI',           stage:'Series J', aiNote:'Largest private tech raise of 2024 at $62B valuation. Positions company for IPO in 2025.' },
  { type:'Funding', acquirer:'xAI (Grok)',         investors:'Sequoia, A16Z',    value:6.0e9, status:'Closed', date:'2024-05-25', sector:'AI',                stage:'Series B', aiNote:'Elon Musk AI venture at $24B valuation. Competes directly with OpenAI and Anthropic.' },
  { type:'Funding', acquirer:'Waymo',              investors:'Alphabet, Tiger',  value:5.6e9, status:'Closed', date:'2024-10-25', sector:'Autonomous Vehicles',stage:'Late Stage', aiNote:'Funds expansion to 10+ US cities. Operating 100k+ paid rides/week in SF and Phoenix.' },
  { type:'Funding', acquirer:'Stripe',             investors:'Sequoia, A16Z',    value:6.5e9, status:'Closed', date:'2024-02-15', sector:'Fintech',            stage:'Late Stage', aiNote:'Valuation at $65B. Funds global expansion and enterprise payment infrastructure buildout.' },
  { type:'IPO',     acquirer:'Reddit',             value:6.4e9,  status:'Closed',  date:'2024-03-21', sector:'Technology',       aiNote:'Opened at $47, priced at $34. First major social media IPO since Pinterest 2019.' },
  { type:'IPO',     acquirer:'Astera Labs',        value:5.5e9,  status:'Closed',  date:'2024-03-20', sector:'Technology',       aiNote:'AI connectivity chip company. Stock surged 72% on debut, benefiting from AI infrastructure demand.' },
  { type:'IPO',     acquirer:'Lineage Logistics',  value:4.4e9,  status:'Closed',  date:'2024-07-25', sector:'Industrials',      aiNote:'Largest IPO of 2024 by proceeds. Temperature-controlled warehousing REIT.' },
]

const TYPE_COLORS: Record<string,string> = { 'M&A':'badge-blue', 'IPO':'badge-amber', 'Funding':'badge-green', 'SPO':'badge-gray' }
const STATUS_COLORS: Record<string,string> = { 'Closed':'badge-green', 'Pending':'badge-amber', 'Rumoured':'badge-gray', 'Withdrawn':'badge-red' }
const SECTORS = [...new Set(DEALS.map(d=>d.sector))].sort()

function fmtVal(v: number) {
  if (v >= 1e12) return `$${(v/1e12).toFixed(1)}T`
  if (v >= 1e9)  return `$${(v/1e9).toFixed(1)}B`
  if (v >= 1e6)  return `$${(v/1e6).toFixed(0)}M`
  return `$${v}`
}

export default function DealsPage() {
  const [type,     setType]     = useState<string>('All')
  const [sector,   setSector]   = useState<string>('All')
  const [status,   setStatus]   = useState<string>('All')
  const [search,   setSearch]   = useState('')
  const [expanded, setExpanded] = useState<number|null>(null)
  const [sort,     setSort]     = useState<'date'|'value'>('date')

  const filtered = DEALS
    .filter(d => {
      if (type   !== 'All'  && d.type   !== type)   return false
      if (sector !== 'All'  && d.sector !== sector)  return false
      if (status !== 'All'  && d.status !== status)  return false
      if (search) {
        const h = `${d.acquirer} ${d.target||''} ${d.investors||''} ${d.sector}`.toLowerCase()
        if (!h.includes(search.toLowerCase())) return false
      }
      return true
    })
    .sort((a,b) => sort==='date' ? new Date(b.date).getTime()-new Date(a.date).getTime() : b.value-a.value)

  const totalValue  = filtered.reduce((s,d)=>s+d.value,0)
  const maCount     = filtered.filter(d=>d.type==='M&A').length
  const fundCount   = filtered.filter(d=>d.type==='Funding').length
  const ipoCount    = filtered.filter(d=>d.type==='IPO').length

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="page-title">Deals & Transactions</h1>
          <p style={{ color:'#7D8FA9', fontSize:13 }}>M&A, funding rounds, IPOs & capital markets</p>
        </div>
        <input className="input" style={{ width:200 }} placeholder="Search deals..."
          value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      {/* KPI strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'Total Deal Value',   value:fmtVal(totalValue),    color:'#1B4FFF' },
          { label:'M&A Transactions',   value:String(maCount),       color:'#059669' },
          { label:'Funding Rounds',     value:String(fundCount),     color:'#D97706' },
          { label:'IPOs',               value:String(ipoCount),      color:'#8B5CF6' },
        ].map(k=>(
          <div key={k.label} className="metric-card">
            <div className="label mb-1">{k.label}</div>
            <div style={{ fontSize:24, fontWeight:900, letterSpacing:'-0.02em', color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4 mb-5">
        <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
          <div>
            <label className="label mb-1 block">Type</label>
            <div style={{ display:'flex', gap:4 }}>
              {['All','M&A','Funding','IPO'].map(t=>(
                <button key={t} onClick={()=>setType(t)} style={{
                  fontSize:11, padding:'4px 10px', borderRadius:20, fontWeight:600, cursor:'pointer',
                  border:type===t?'1.5px solid #1B4FFF':'1px solid #E8EDF5',
                  background:type===t?'#EEF2FF':'#F9FAFB', color:type===t?'#1B4FFF':'#7D8FA9'
                }}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label mb-1 block">Status</label>
            <div style={{ display:'flex', gap:4 }}>
              {['All','Pending','Closed','Rumoured'].map(s=>(
                <button key={s} onClick={()=>setStatus(s)} style={{
                  fontSize:11, padding:'4px 10px', borderRadius:20, fontWeight:600, cursor:'pointer',
                  border:status===s?'1.5px solid #1B4FFF':'1px solid #E8EDF5',
                  background:status===s?'#EEF2FF':'#F9FAFB', color:status===s?'#1B4FFF':'#7D8FA9'
                }}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label mb-1 block">Sector</label>
            <select className="input" style={{ width:160 }} value={sector} onChange={e=>setSector(e.target.value)}>
              <option value="All">All sectors</option>
              {SECTORS.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ marginLeft:'auto', alignSelf:'flex-end' }}>
            <label className="label mb-1 block">Sort by</label>
            <div style={{ display:'flex', gap:4 }}>
              {[['date','Date'],['value','Value']].map(([v,l])=>(
                <button key={v} onClick={()=>setSort(v as any)} style={{
                  fontSize:11, padding:'4px 10px', borderRadius:20, fontWeight:600, cursor:'pointer',
                  border:sort===v?'1.5px solid #1B4FFF':'1px solid #E8EDF5',
                  background:sort===v?'#EEF2FF':'#F9FAFB', color:sort===v?'#1B4FFF':'#7D8FA9'
                }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Parties</th>
              <th className="right">Value</th>
              <th>Sector</th>
              <th>Date</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d,i)=>(
              <>
                <tr key={i} style={{ cursor:'pointer' }} onClick={()=>setExpanded(expanded===i?null:i)}>
                  <td><span className={`badge ${TYPE_COLORS[d.type]}`}>{d.type}</span></td>
                  <td>
                    <div style={{ fontWeight:700, fontSize:13, color:'#0A1628' }}>{d.acquirer}</div>
                    {d.target    && <div style={{ fontSize:11, color:'#7D8FA9' }}>→ {d.target}</div>}
                    {d.investors && <div style={{ fontSize:11, color:'#7D8FA9' }}>{d.investors}</div>}
                    {d.stage     && <div style={{ fontSize:10, color:'#9CA3AF' }}>{d.stage}</div>}
                  </td>
                  <td className="right" style={{ fontWeight:800, fontSize:14, color:'#0A1628' }}>{fmtVal(d.value)}</td>
                  <td style={{ fontSize:12, color:'#7D8FA9' }}>{d.sector}</td>
                  <td style={{ fontSize:12, color:'#7D8FA9', whiteSpace:'nowrap' }}>{d.date}</td>
                  <td><span className={`badge ${STATUS_COLORS[d.status]}`}>{d.status}</span></td>
                  <td>
                    {d.premium && <span style={{ fontSize:11, color:'#059669', fontWeight:700 }}>+{d.premium}</span>}
                    <span style={{ fontSize:11, color:'#C5CFDF', marginLeft:8 }}>{expanded===i?'▲':'▼'}</span>
                  </td>
                </tr>
                {expanded===i && d.aiNote && (
                  <tr key={`${i}-note`}>
                    <td colSpan={7} style={{ background:'#F8FAFF', padding:'12px 20px' }}>
                      <div style={{ fontSize:12, color:'#3D4F6E', lineHeight:1.6 }}>
                        <span style={{ fontWeight:700, color:'#1B4FFF', marginRight:8 }}>🧠 AI Analysis:</span>
                        {d.aiNote}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign:'center', padding:'40px 0', color:'#7D8FA9' }}>No deals match filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

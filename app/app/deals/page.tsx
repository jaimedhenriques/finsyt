'use client'
import { useEffect, useState } from 'react'
import { fmtLarge } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Deal {
  id:          string
  acquirer:    string
  target:      string
  value:       number   // USD millions
  type:        'acquisition' | 'merger' | 'ipo' | 'spac' | 'lbo' | 'jv' | 'stake'
  sector:      string
  status:      'announced' | 'pending' | 'completed' | 'terminated'
  announced:   string
  closed?:     string
  premium?:    number   // % premium to pre-deal price
  advisor?:    string
  description: string
  ebitdaMult?: number
  revMult?:    number
}

const DEALS_DATA: Deal[] = [
  { id:'1',  acquirer:'Synopsys',       target:'Ansys',              value:35000, type:'acquisition', sector:'Technology',   status:'pending',   announced:'2024-01-16', premium:35, advisor:'Goldman Sachs', description:'EDA and simulation software merger to create semiconductor design powerhouse', ebitdaMult:42, revMult:14 },
  { id:'2',  acquirer:'Capital One',    target:'Discover Financial', value:35300, type:'acquisition', sector:'Financials',   status:'pending',   announced:'2024-02-19', premium:26, advisor:'Morgan Stanley', description:'Major credit card consolidation creating third-largest card network', ebitdaMult:11, revMult:2.8 },
  { id:'3',  acquirer:'Hewlett Packard',target:'Juniper Networks',   value:14000, type:'acquisition', sector:'Technology',   status:'completed', announced:'2024-01-09', closed:'2024-09-13', premium:32, advisor:'JPMorgan', description:'Networking equipment acquisition to boost HPE AI infrastructure play', ebitdaMult:18, revMult:2.4 },
  { id:'4',  acquirer:'Nippon Steel',   target:'US Steel',           value:14900, type:'acquisition', sector:'Industrials',  status:'terminated',announced:'2023-12-18', premium:40, advisor:'Barclays', description:'Attempted acquisition blocked by US government on national security grounds' },
  { id:'5',  acquirer:'Mars Inc.',      target:'Kellanova',          value:35900, type:'acquisition', sector:'Consumer Staples', status:'completed', announced:'2024-08-14', closed:'2025-03-07', premium:33, advisor:'Lazard', description:'Snack food giant acquisition — Pringles, Cheez-It, Pop-Tarts added to Mars portfolio', ebitdaMult:22, revMult:3.1 },
  { id:'6',  acquirer:'Alphabet (Google)',target:'Wiz',              value:23000, type:'acquisition', sector:'Technology',   status:'pending',   announced:'2024-07-18', premium:0, advisor:'Centerview Partners', description:'Landmark cloud security acquisition — largest ever for Google', ebitdaMult:0, revMult:46 },
  { id:'7',  acquirer:'Blackstone',     target:'AIR Communities',    value:10000, type:'lbo',         sector:'Real Estate',  status:'pending',   announced:'2024-04-08', premium:25, advisor:'BofA Securities', description:'Apartment REIT take-private by Blackstone Real Estate', ebitdaMult:28, revMult:9 },
  { id:'8',  acquirer:'SBA Communications',target:'Millicom Towers', value:1000, type:'acquisition', sector:'Communication',status:'completed',  announced:'2024-03-11', closed:'2024-11-01', premium:0, advisor:'Deutsche Bank', description:'LatAm tower acquisition to expand SBA\'s emerging markets footprint' },
  { id:'9',  acquirer:'Diamondback Energy',target:'Endeavor Energy', value:26000, type:'acquisition', sector:'Energy',       status:'completed', announced:'2024-02-12', closed:'2024-09-10', premium:0, advisor:'Goldman Sachs', description:'Permian Basin consolidation — creates one of largest US shale producers', ebitdaMult:5.2, revMult:2.1 },
  { id:'10', acquirer:'ConocoPhillips', target:'Marathon Oil',       value:22500, type:'acquisition', sector:'Energy',       status:'completed', announced:'2024-05-29', closed:'2024-11-22', premium:14, advisor:'Morgan Stanley', description:'Oil & gas consolidation wave continues; adds 2Bboe reserves', ebitdaMult:4.8, revMult:1.9 },
  { id:'11', acquirer:'MicroStrategy',  target:'Bitcoin Treasury',   value:8000,  type:'stake',       sector:'Technology',   status:'completed', announced:'2024-11-01', premium:0, advisor:'', description:'Ongoing Bitcoin acquisition strategy — accumulated 400k+ BTC as corporate treasury' },
  { id:'12', acquirer:'Publicis Groupe',target:'Lotame',             value:250,   type:'acquisition', sector:'Communication',status:'completed', announced:'2024-02-07', closed:'2024-05-01', premium:0, advisor:'', description:'Data technology acquisition to strengthen Publicis AI advertising capabilities' },
]

const STATUS_COLORS: Record<string, string> = {
  announced:  '#1B4FFF',
  pending:    '#D97706',
  completed:  '#059669',
  terminated: '#DC2626',
}

const TYPE_LABELS: Record<string, string> = {
  acquisition:'Acquisition', merger:'Merger', ipo:'IPO', spac:'SPAC', lbo:'LBO', jv:'JV', stake:'Stake'
}

const SECTORS = ['All','Technology','Financials','Energy','Consumer Staples','Industrials','Real Estate','Communication']
const STATUSES = ['All','announced','pending','completed','terminated']

export default function DealsPage() {
  const [search, setSearch]     = useState('')
  const [sector, setSector]     = useState('All')
  const [status, setStatus]     = useState('All')
  const [sortBy, setSortBy]     = useState<'value'|'announced'>('announced')
  const [selected, setSelected] = useState<Deal | null>(null)

  const filtered = DEALS_DATA
    .filter(d => {
      if (search && !d.acquirer.toLowerCase().includes(search.toLowerCase()) &&
                   !d.target.toLowerCase().includes(search.toLowerCase()) &&
                   !d.description.toLowerCase().includes(search.toLowerCase())) return false
      if (sector !== 'All' && d.sector !== sector) return false
      if (status !== 'All' && d.status !== status) return false
      return true
    })
    .sort((a, b) => sortBy === 'value' ? b.value - a.value : b.announced.localeCompare(a.announced))

  const totalValue = filtered.reduce((s, d) => s + d.value, 0)
  const avgPremium = filtered.filter(d => d.premium != null && d.premium! > 0).reduce((s,d,_,arr) => s + d.premium! / arr.length, 0)

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title">Deals & M&A</h1>
          <p style={{ fontSize:13, marginTop:2, color:'#7D8FA9' }}>Acquisitions · mergers · LBOs · strategic transactions</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
            style={{ padding:'7px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:12, fontFamily:'inherit', color:'#1C2B4A', background:'#fff', cursor:'pointer' }}>
            <option value="announced">Sort: Date</option>
            <option value="value">Sort: Value</option>
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'Total Deals Shown', value: filtered.length,                                      color:'#1B4FFF' },
          { label:'Total Value',       value: `$${(totalValue/1000).toFixed(0)}B`,                  color:'#0A1628' },
          { label:'Pending',           value: filtered.filter(d=>d.status==='pending').length,      color:'#D97706' },
          { label:'Avg. Premium',      value: avgPremium > 0 ? `${avgPremium.toFixed(0)}%` : '—',  color:'#059669' },
        ].map(card => (
          <div key={card.label} className="metric-card">
            <div style={{ fontSize:11, fontWeight:600, color:'#7D8FA9', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6 }}>{card.label}</div>
            <div style={{ fontWeight:900, fontSize:'1.5rem', color: card.color, letterSpacing:'-0.03em' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search acquirer, target, description…"
          style={{ flex:1, minWidth:200, padding:'8px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none' }} />
        <select value={sector} onChange={e => setSector(e.target.value)}
          style={{ padding:'8px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', color:'#1C2B4A', background:'#fff', cursor:'pointer' }}>
          {SECTORS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}
          style={{ padding:'8px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', color:'#1C2B4A', background:'#fff', cursor:'pointer', textTransform:'capitalize' }}>
          {STATUSES.map(s => <option key={s} style={{textTransform:'capitalize'}}>{s}</option>)}
        </select>
      </div>

      {/* Deals table */}
      <div className="card" style={{ overflow:'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Acquirer</th><th>Target</th><th>Sector</th><th className="right">Value</th>
              <th className="right">Premium</th><th>Type</th><th>Status</th><th>Announced</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(deal => (
              <tr key={deal.id} style={{ cursor:'pointer' }} onClick={() => setSelected(deal)}>
                <td style={{ fontWeight:700, fontSize:13, color:'#0A1628' }}>{deal.acquirer}</td>
                <td style={{ fontSize:13, color:'#1C2B4A' }}>{deal.target}</td>
                <td style={{ fontSize:12, color:'#7D8FA9' }}>{deal.sector}</td>
                <td className="right" style={{ fontWeight:700, fontSize:13 }}>${(deal.value/1000).toFixed(1)}B</td>
                <td className="right" style={{ fontSize:13, color: deal.premium && deal.premium > 0 ? '#059669' : '#B0BCD0', fontWeight:600 }}>
                  {deal.premium != null && deal.premium > 0 ? `+${deal.premium}%` : '—'}
                </td>
                <td>
                  <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#F0F4FA', color:'#4A5568' }}>
                    {TYPE_LABELS[deal.type]}
                  </span>
                </td>
                <td>
                  <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, textTransform:'capitalize',
                    background:`${STATUS_COLORS[deal.status]}18`, color:STATUS_COLORS[deal.status] }}>
                    {deal.status}
                  </span>
                </td>
                <td style={{ fontSize:12, color:'#7D8FA9' }}>{deal.announced}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Deal detail modal */}
      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position:'fixed', inset:0, background:'rgba(8,14,26,0.4)', zIndex:1000, backdropFilter:'blur(2px)' }} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:1001, width:560, maxWidth:'calc(100vw - 32px)', background:'#fff', borderRadius:16, boxShadow:'0 16px 64px rgba(0,0,0,0.15)', overflow:'hidden', maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ padding:'16px 20px', background:'linear-gradient(135deg,#080E1A,#0A1220)', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:15, color:'#fff' }}>{selected.acquirer} → {selected.target}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:2 }}>{selected.sector} · {TYPE_LABELS[selected.type]}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', fontSize:20, cursor:'pointer' }}>×</button>
            </div>
            <div style={{ padding:24 }}>
              {/* Status + value row */}
              <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
                {[
                  { label:'Deal Value', value:`$${(selected.value/1000).toFixed(1)}B` },
                  { label:'Premium',    value: selected.premium ? `+${selected.premium}%` : '—' },
                  { label:'EV/EBITDA', value: selected.ebitdaMult ? `${selected.ebitdaMult}x` : '—' },
                  { label:'EV/Rev',    value: selected.revMult    ? `${selected.revMult}x`    : '—' },
                ].map(kv => (
                  <div key={kv.label} style={{ flex:1, minWidth:110, padding:'12px 14px', borderRadius:10, background:'#F8FAFD', border:'1px solid #E2E8F2' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#7D8FA9', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 }}>{kv.label}</div>
                    <div style={{ fontWeight:900, fontSize:'1.25rem', color:'#0A1628', letterSpacing:'-0.02em' }}>{kv.value}</div>
                  </div>
                ))}
              </div>
              {/* Description */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', textTransform:'uppercase', marginBottom:8 }}>Deal Summary</div>
                <p style={{ fontSize:13, color:'#1C2B4A', lineHeight:1.7, margin:0 }}>{selected.description}</p>
              </div>
              {/* Timeline */}
              <div style={{ display:'flex', gap:16, fontSize:12, color:'#7D8FA9' }}>
                <div><span style={{fontWeight:700,color:'#0A1628'}}>Announced:</span> {selected.announced}</div>
                {selected.closed && <div><span style={{fontWeight:700,color:'#059669'}}>Closed:</span> {selected.closed}</div>}
                {selected.advisor && <div><span style={{fontWeight:700,color:'#0A1628'}}>Advisor:</span> {selected.advisor}</div>}
              </div>
              {/* Status badge */}
              <div style={{ marginTop:16 }}>
                <span style={{ fontSize:12, fontWeight:700, padding:'4px 14px', borderRadius:20, textTransform:'capitalize',
                  background:`${STATUS_COLORS[selected.status]}18`, color:STATUS_COLORS[selected.status] }}>
                  {selected.status}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

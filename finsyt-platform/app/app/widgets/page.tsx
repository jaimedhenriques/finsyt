'use client'
import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, BarChart, Bar, LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────
type ChartType = 'area' | 'bar' | 'line' | 'metric' | 'table'
type DataFreq  = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'

interface DataPoint {
  id:          string
  label:       string
  category:    string
  description: string
  source:      string
  unit:        string
  sampleVal:   string
  freq:        DataFreq[]
}

interface WidgetConfig {
  id:          string
  name:        string
  description: string
  chartType:   ChartType
  dataPoints:  string[]       // DataPoint ids
  symbols:     string[]
  freq:        DataFreq
  color:       string
  showGrid:    boolean
  showLegend:  boolean
  createdAt:   string
}

// ── Data catalogue ────────────────────────────────────────────────────────────
const DATA_CATALOGUE: DataPoint[] = [
  // Price & market
  { id:'price',         label:'Stock Price',          category:'Market',       description:'Real-time closing price',                     source:'Finnhub',   unit:'$',    sampleVal:'924.80', freq:['daily','weekly','monthly'] },
  { id:'volume',        label:'Trading Volume',       category:'Market',       description:'Daily trading volume',                        source:'Finnhub',   unit:'',     sampleVal:'38.2M',  freq:['daily','weekly'] },
  { id:'market_cap',    label:'Market Cap',           category:'Market',       description:'Market capitalisation',                       source:'Finnhub',   unit:'$B',   sampleVal:'2.27T',  freq:['daily','monthly'] },
  { id:'pe_ratio',      label:'P/E Ratio',            category:'Valuation',    description:'Price to earnings (NTM)',                     source:'FMP',       unit:'x',    sampleVal:'42.3x',  freq:['daily','monthly','quarterly'] },
  { id:'ev_ebitda',     label:'EV/EBITDA',            category:'Valuation',    description:'Enterprise value to EBITDA',                  source:'FMP',       unit:'x',    sampleVal:'38.1x',  freq:['quarterly','annual'] },
  { id:'ps_ratio',      label:'P/S Ratio',            category:'Valuation',    description:'Price to sales',                              source:'FMP',       unit:'x',    sampleVal:'25.4x',  freq:['quarterly','annual'] },
  { id:'pb_ratio',      label:'P/B Ratio',            category:'Valuation',    description:'Price to book value',                         source:'FMP',       unit:'x',    sampleVal:'49.2x',  freq:['quarterly','annual'] },
  // Income statement
  { id:'revenue',       label:'Revenue',              category:'Financials',   description:'Total revenue',                               source:'FMP',       unit:'$B',   sampleVal:'39.3B',  freq:['quarterly','annual'] },
  { id:'gross_profit',  label:'Gross Profit',         category:'Financials',   description:'Gross profit',                                source:'FMP',       unit:'$B',   sampleVal:'29.8B',  freq:['quarterly','annual'] },
  { id:'gross_margin',  label:'Gross Margin',         category:'Financials',   description:'Gross profit margin %',                       source:'FMP',       unit:'%',    sampleVal:'75.9%',  freq:['quarterly','annual'] },
  { id:'ebitda',        label:'EBITDA',               category:'Financials',   description:'Earnings before interest, taxes, D&A',        source:'FMP',       unit:'$B',   sampleVal:'21.8B',  freq:['quarterly','annual'] },
  { id:'net_income',    label:'Net Income',           category:'Financials',   description:'Net income / earnings',                       source:'FMP',       unit:'$B',   sampleVal:'19.3B',  freq:['quarterly','annual'] },
  { id:'eps',           label:'EPS (Diluted)',         category:'Financials',   description:'Earnings per share, diluted',                  source:'FMP',       unit:'$',    sampleVal:'$0.78',  freq:['quarterly','annual'] },
  { id:'net_margin',    label:'Net Margin',           category:'Financials',   description:'Net profit margin %',                         source:'FMP',       unit:'%',    sampleVal:'49.1%',  freq:['quarterly','annual'] },
  { id:'op_margin',     label:'Operating Margin',     category:'Financials',   description:'Operating income margin %',                   source:'FMP',       unit:'%',    sampleVal:'62.1%',  freq:['quarterly','annual'] },
  { id:'r_and_d',       label:'R&D Expense',          category:'Financials',   description:'Research and development spending',           source:'FMP',       unit:'$B',   sampleVal:'3.1B',   freq:['quarterly','annual'] },
  // Cash flow
  { id:'operating_cf',  label:'Operating Cash Flow',  category:'Cash Flow',    description:'Cash from operations',                        source:'FMP',       unit:'$B',   sampleVal:'16.6B',  freq:['quarterly','annual'] },
  { id:'capex',         label:'CapEx',                category:'Cash Flow',    description:'Capital expenditure',                         source:'FMP',       unit:'$B',   sampleVal:'-1.1B',  freq:['quarterly','annual'] },
  { id:'fcf',           label:'Free Cash Flow',       category:'Cash Flow',    description:'Operating CF minus CapEx',                    source:'FMP',       unit:'$B',   sampleVal:'15.5B',  freq:['quarterly','annual'] },
  { id:'fcf_margin',    label:'FCF Margin',           category:'Cash Flow',    description:'Free cash flow as % of revenue',              source:'FMP',       unit:'%',    sampleVal:'39.4%',  freq:['quarterly','annual'] },
  // Balance sheet
  { id:'cash',          label:'Cash & Equivalents',   category:'Balance Sheet',description:'Cash and short-term investments',             source:'FMP',       unit:'$B',   sampleVal:'26.0B',  freq:['quarterly','annual'] },
  { id:'total_debt',    label:'Total Debt',           category:'Balance Sheet',description:'Total long-term and short-term debt',         source:'FMP',       unit:'$B',   sampleVal:'8.5B',   freq:['quarterly','annual'] },
  { id:'net_debt',      label:'Net Debt',             category:'Balance Sheet',description:'Total debt minus cash',                       source:'FMP',       unit:'$B',   sampleVal:'-17.5B', freq:['quarterly','annual'] },
  // Growth
  { id:'rev_growth',    label:'Revenue Growth YoY',   category:'Growth',       description:'Year-over-year revenue growth',               source:'FMP',       unit:'%',    sampleVal:'+73.4%', freq:['quarterly','annual'] },
  { id:'eps_growth',    label:'EPS Growth YoY',       category:'Growth',       description:'Year-over-year EPS growth',                   source:'FMP',       unit:'%',    sampleVal:'+82.0%', freq:['quarterly','annual'] },
  { id:'fcf_growth',    label:'FCF Growth YoY',       category:'Growth',       description:'Year-over-year FCF growth',                   source:'FMP',       unit:'%',    sampleVal:'+71.2%', freq:['quarterly','annual'] },
  // Macro
  { id:'fed_rate',      label:'Fed Funds Rate',       category:'Macro',        description:'Federal Reserve policy rate',                  source:'FRED',      unit:'%',    sampleVal:'4.33%',  freq:['monthly','weekly'] },
  { id:'cpi',           label:'CPI Inflation',        category:'Macro',        description:'Consumer Price Index YoY',                    source:'FRED',      unit:'%',    sampleVal:'2.8%',   freq:['monthly'] },
  { id:'yield_10y',     label:'10Y Treasury Yield',   category:'Macro',        description:'US 10-year bond yield',                       source:'FRED',      unit:'%',    sampleVal:'4.36%',  freq:['daily','weekly','monthly'] },
  { id:'yield_2y',      label:'2Y Treasury Yield',    category:'Macro',        description:'US 2-year bond yield',                        source:'FRED',      unit:'%',    sampleVal:'3.88%',  freq:['daily','weekly','monthly'] },
  { id:'vix',           label:'VIX',                  category:'Macro',        description:'CBOE Volatility Index',                       source:'FRED',      unit:'pts',  sampleVal:'18.4',   freq:['daily','weekly'] },
]

const CATEGORIES = ['All', ...Array.from(new Set(DATA_CATALOGUE.map(d=>d.category)))]
const CHART_TYPES: { id: ChartType; icon: string; label: string }[] = [
  { id:'area',   icon:'📈', label:'Area'   },
  { id:'line',   icon:'〰️', label:'Line'   },
  { id:'bar',    icon:'▊',  label:'Bar'    },
  { id:'metric', icon:'🔢', label:'KPI Card'},
  { id:'table',  icon:'▤',  label:'Table'  },
]
const COLORS = ['#1B4FFF','#059669','#D97706','#DC2626','#8B5CF6','#0891B2','#EC4899']
const SOURCE_BADGE: Record<string,string> = { Finnhub:'#0891B2', FMP:'#059669', FRED:'#DC2626', AV:'#8B5CF6' }

// ── Mock chart data ───────────────────────────────────────────────────────────
function mockSeries(n=12) { return Array.from({length:n},(_,i)=>({ t:`Q${(i%4)+1}'${23+Math.floor(i/4)}`, v: 20+Math.random()*60 })) }

// ── Chart preview ─────────────────────────────────────────────────────────────
function ChartPreview({ type, color, label }: { type: ChartType; color: string; label: string }) {
  const data = mockSeries()
  if (type === 'metric') return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:4 }}>
      <div style={{ fontSize:32, fontWeight:900, color, letterSpacing:'-0.03em' }}>$924.80</div>
      <div style={{ fontSize:12, fontWeight:600, color:'#059669' }}>▲ +2.57% today</div>
      <div style={{ fontSize:11, color:'#B0BCD0' }}>{label}</div>
    </div>
  )
  if (type === 'table') return (
    <div style={{ fontSize:11, padding:'8px 0' }}>
      {['Q1 \'26','Q4 \'25','Q3 \'25','Q2 \'25'].map((q,i)=>(
        <div key={q} style={{ display:'flex', gap:12, padding:'5px 8px', background:i%2===0?'#F7F9FC':'transparent', borderRadius:4 }}>
          <span style={{ flex:1, color:'#7D8FA9' }}>{q}</span>
          <span style={{ fontWeight:700, color:'#0A1628' }}>${(39.3-i*2).toFixed(1)}B</span>
          <span style={{ color:'#059669', fontWeight:600 }}>+{(73-i*8).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  )
  const common = { data, margin:{top:5,right:8,bottom:0,left:0} }
  return (
    <ResponsiveContainer width="100%" height="100%">
      {type==='bar'
        ? <BarChart {...common}><CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" /><XAxis dataKey="t" tick={{fontSize:9,fill:'#B0BCD0'}} /><YAxis hide /><Tooltip contentStyle={{fontSize:11}} /><Bar dataKey="v" fill={color} radius={[3,3,0,0]} /></BarChart>
        : type==='line'
        ? <LineChart {...common}><CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" /><XAxis dataKey="t" tick={{fontSize:9,fill:'#B0BCD0'}} /><YAxis hide /><Tooltip contentStyle={{fontSize:11}} /><Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} /></LineChart>
        : <AreaChart {...common}><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={0.2}/><stop offset="95%" stopColor={color} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" /><XAxis dataKey="t" tick={{fontSize:9,fill:'#B0BCD0'}} /><YAxis hide /><Tooltip contentStyle={{fontSize:11}} /><Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill="url(#cg)" dot={false}/></AreaChart>
      }
    </ResponsiveContainer>
  )
}

// ── Saved widget card ─────────────────────────────────────────────────────────
function SavedWidgetCard({ w, onDelete }: { w: WidgetConfig; onDelete: () => void }) {
  const dps = w.dataPoints.map(id => DATA_CATALOGUE.find(d=>d.id===id)).filter(Boolean)
  return (
    <div style={{ background:'#fff', border:'1.5px solid #E8EDF4', borderRadius:12, overflow:'hidden', transition:'box-shadow 0.15s' }}
      onMouseEnter={e=>(e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.08)')} onMouseLeave={e=>(e.currentTarget.style.boxShadow='none')}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderBottom:'1px solid #F5F7FB' }}>
        <span style={{ fontSize:14 }}>{CHART_TYPES.find(c=>c.id===w.chartType)?.icon}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#0A1628', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{w.name}</div>
          <div style={{ fontSize:10.5, color:'#B0BCD0' }}>{w.symbols.join(', ')} · {w.freq}</div>
        </div>
        <button onClick={onDelete} style={{ background:'none', border:'none', cursor:'pointer', color:'#D0DAE8', fontSize:16 }}>×</button>
      </div>
      <div style={{ height:120, padding:'8px 8px 4px' }}>
        <ChartPreview type={w.chartType} color={w.color} label={w.name} />
      </div>
      <div style={{ padding:'6px 14px 10px', display:'flex', gap:4, flexWrap:'wrap' }}>
        {dps.map(d => <span key={d!.id} style={{ fontSize:9.5, padding:'2px 7px', borderRadius:4, background:SOURCE_BADGE[d!.source]+'18'||'#F0F4FA', color:SOURCE_BADGE[d!.source]||'#7D8FA9', fontWeight:600 }}>{d!.label}</span>)}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WidgetsPage() {
  const [tab, setTab]           = useState<'builder'|'library'>('library')
  const [saved, setSaved]       = useState<WidgetConfig[]>([])
  const [cat, setCat]           = useState('All')
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [symbols, setSymbols]   = useState(['NVDA'])
  const [symbolInput, setSymInput] = useState('')
  const [chartType, setChartType] = useState<ChartType>('area')
  const [color, setColor]       = useState(COLORS[0])
  const [widgetName, setWidgetName] = useState('')
  const [freq, setFreq]         = useState<DataFreq>('quarterly')
  const [saved_, setSaved_]     = useState(false)

  // Load from localStorage
  useEffect(() => {
    try { const s = localStorage.getItem('finsyt-custom-widgets'); if (s) setSaved(JSON.parse(s)) } catch {}
  }, [])

  const filtered = DATA_CATALOGUE
    .filter(d => cat==='All' || d.category===cat)
    .filter(d => !search || d.label.toLowerCase().includes(search.toLowerCase()) || d.category.toLowerCase().includes(search.toLowerCase()))

  function toggleDataPoint(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])
  }

  function addSymbol() {
    const s = symbolInput.toUpperCase().trim()
    if (s && !symbols.includes(s)) setSymbols(p => [...p, s])
    setSymInput('')
  }

  function saveWidget() {
    if (!selected.length) return
    const w: WidgetConfig = {
      id:         `w-${Date.now()}`,
      name:       widgetName || `${symbols.join('+')} — ${DATA_CATALOGUE.find(d=>d.id===selected[0])?.label || 'Custom'}`,
      description:'',
      chartType,
      dataPoints: selected,
      symbols,
      freq,
      color,
      showGrid:   true,
      showLegend: true,
      createdAt:  new Date().toISOString(),
    }
    const next = [...saved, w]
    setSaved(next)
    localStorage.setItem('finsyt-custom-widgets', JSON.stringify(next))
    setSaved_(true)
    setTimeout(() => { setSaved_(false); setTab('library') }, 1200)
  }

  return (
    <div style={{ padding:'1.25rem 1.5rem', background:'#F7F9FC', minHeight:'calc(100vh - 60px)' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <p style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:3 }}>WORKSPACE</p>
          <h1 style={{ fontSize:'1.375rem', fontWeight:900, color:'#0A1628', letterSpacing:'-0.025em' }}>Widget Builder</h1>
          <p style={{ fontSize:13, color:'#7D8FA9', marginTop:3 }}>Build custom data widgets. Add them to any page in your workspace.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setTab('library')} style={{ padding:'7px 16px', background:tab==='library'?'#0A1628':'#fff', color:tab==='library'?'#fff':'#3D4F6E', border:'1.5px solid', borderColor:tab==='library'?'#0A1628':'#E8EDF4', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>My Widgets ({saved.length})</button>
          <button onClick={() => setTab('builder')} style={{ padding:'7px 16px', background:tab==='builder'?'#1B4FFF':'#fff', color:tab==='builder'?'#fff':'#3D4F6E', border:'1.5px solid', borderColor:tab==='builder'?'#1B4FFF':'#E8EDF4', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>+ New Widget</button>
        </div>
      </div>

      {/* ── LIBRARY TAB ── */}
      {tab === 'library' && (
        <div>
          {saved.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 24px', background:'#fff', border:'2px dashed #E8EDF4', borderRadius:14 }}>
              <div style={{ fontSize:36, marginBottom:12 }}>🧩</div>
              <div style={{ fontSize:15, fontWeight:700, color:'#7D8FA9', marginBottom:6 }}>No custom widgets yet</div>
              <p style={{ fontSize:13, color:'#B0BCD0', marginBottom:20 }}>Build your first widget — choose data points, chart type, and companies.</p>
              <button onClick={() => setTab('builder')} style={{ padding:'9px 22px', background:'#1B4FFF', color:'#fff', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>+ Build a Widget</button>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16 }}>
              {saved.map(w => (
                <SavedWidgetCard key={w.id} w={w} onDelete={() => {
                  const next = saved.filter(x=>x.id!==w.id)
                  setSaved(next)
                  localStorage.setItem('finsyt-custom-widgets', JSON.stringify(next))
                }} />
              ))}
              <button onClick={() => setTab('builder')} style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, background:'transparent', border:'2px dashed #D0DAE8', borderRadius:12, cursor:'pointer', fontFamily:'inherit', minHeight:200, transition:'border-color 0.15s' }}
                onMouseEnter={e=>(e.currentTarget.style.borderColor='#1B4FFF')} onMouseLeave={e=>(e.currentTarget.style.borderColor='#D0DAE8')}>
                <span style={{ fontSize:28, color:'#D0DAE8' }}>+</span>
                <span style={{ fontSize:12, fontWeight:600, color:'#B0BCD0' }}>New Widget</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── BUILDER TAB ── */}
      {tab === 'builder' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:16 }}>
          {/* Left: data selector */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {/* Step 1: Companies */}
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'16px 18px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:10 }}>1 · Companies / Tickers</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                {symbols.map(s => (
                  <span key={s} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', background:'#EEF3FF', borderRadius:999, fontSize:12, fontWeight:700, color:'#1B4FFF' }}>
                    {s}
                    <button onClick={() => setSymbols(p=>p.filter(x=>x!==s))} style={{ background:'none', border:'none', cursor:'pointer', color:'#93B4FF', fontSize:14, lineHeight:1, padding:0 }}>×</button>
                  </span>
                ))}
                <div style={{ display:'flex', gap:5 }}>
                  <input value={symbolInput} onChange={e=>setSymInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addSymbol()} placeholder="Add ticker…" style={{ border:'1px solid #E8EDF4', borderRadius:7, padding:'4px 9px', fontSize:12, fontFamily:'inherit', outline:'none', width:110, color:'#0A1628' }} />
                  <button onClick={addSymbol} style={{ padding:'4px 10px', background:'#1B4FFF', color:'#fff', border:'none', borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>+</button>
                </div>
              </div>
            </div>

            {/* Step 2: Data Points */}
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'16px 18px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', letterSpacing:'0.08em', textTransform:'uppercase', flex:1 }}>2 · Data Points</div>
                {selected.length > 0 && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, background:'#EEF3FF', color:'#1B4FFF', fontWeight:700 }}>{selected.length} selected</span>}
              </div>

              {/* Search + category */}
              <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                <div style={{ position:'relative', flex:1 }}>
                  <svg style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'#B0BCD0' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search metrics…" style={{ width:'100%', padding:'6px 10px 6px 26px', border:'1px solid #E8EDF4', borderRadius:7, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:'#0A1628' }} />
                </div>
                <select value={cat} onChange={e=>setCat(e.target.value)} style={{ padding:'6px 10px', border:'1px solid #E8EDF4', borderRadius:7, fontSize:12, fontFamily:'inherit', outline:'none', color:'#3D4F6E', cursor:'pointer' }}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              {/* Data point grid */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:6, maxHeight:360, overflowY:'auto' }}>
                {filtered.map(d => {
                  const sel = selected.includes(d.id)
                  return (
                    <button key={d.id} onClick={() => toggleDataPoint(d.id)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 11px', background:sel?'#EEF3FF':'#F7F9FC', border:`1.5px solid ${sel?'#1B4FFF':'#E8EDF4'}`, borderRadius:9, cursor:'pointer', textAlign:'left', fontFamily:'inherit', transition:'all 0.1s' }}>
                      <div style={{ width:18, height:18, borderRadius:4, border:`2px solid ${sel?'#1B4FFF':'#D0DAE8'}`, background:sel?'#1B4FFF':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.1s' }}>
                        {sel && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3"/></svg>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'#0A1628', marginBottom:1 }}>{d.label}</div>
                        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                          <span style={{ fontSize:10, color:'#B0BCD0' }}>{d.unit || d.category}</span>
                          <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, background:SOURCE_BADGE[d.source]+'18', color:SOURCE_BADGE[d.source], fontWeight:600 }}>{d.source}</span>
                        </div>
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', flexShrink:0 }}>{d.sampleVal}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Step 3: Frequency */}
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'14px 18px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:10 }}>3 · Time Frequency</div>
              <div style={{ display:'flex', gap:6 }}>
                {(['daily','weekly','monthly','quarterly','annual'] as DataFreq[]).map(f => (
                  <button key={f} onClick={() => setFreq(f)} style={{ padding:'5px 12px', borderRadius:7, border:'1.5px solid', borderColor:freq===f?'#1B4FFF':'#E8EDF4', background:freq===f?'#EEF3FF':'#F7F9FC', color:freq===f?'#1B4FFF':'#7D8FA9', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize' }}>{f}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: config + preview */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {/* Chart type */}
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'14px 16px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:10 }}>Chart Type</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:6 }}>
                {CHART_TYPES.map(c => (
                  <button key={c.id} onClick={() => setChartType(c.id)} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'8px 4px', borderRadius:8, border:'1.5px solid', borderColor:chartType===c.id?'#1B4FFF':'#E8EDF4', background:chartType===c.id?'#EEF3FF':'#F7F9FC', cursor:'pointer', fontFamily:'inherit', transition:'all 0.1s' }}>
                    <span style={{ fontSize:16 }}>{c.icon}</span>
                    <span style={{ fontSize:9.5, fontWeight:600, color:chartType===c.id?'#1B4FFF':'#7D8FA9' }}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'14px 16px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:10 }}>Colour</div>
              <div style={{ display:'flex', gap:8 }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)} style={{ width:26, height:26, borderRadius:'50%', background:c, border:`3px solid ${color===c?'#0A1628':'transparent'}`, cursor:'pointer', transition:'border-color 0.1s' }} />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'14px 16px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:10 }}>Preview</div>
              <div style={{ height:160, background:'#F9FAFB', borderRadius:8, padding:'8px', display:'flex', alignItems:'stretch' }}>
                {selected.length === 0
                  ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', width:'100%', color:'#B0BCD0', fontSize:12 }}>Select data points to preview</div>
                  : <ChartPreview type={chartType} color={color} label={widgetName || 'Preview'} />
                }
              </div>
            </div>

            {/* Widget name */}
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'14px 16px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:8 }}>Widget Name</div>
              <input value={widgetName} onChange={e=>setWidgetName(e.target.value)} placeholder="e.g. NVDA Revenue + Margin Trend" style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #E8EDF4', borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:'#0A1628' }}
                onFocus={e=>(e.currentTarget.style.borderColor='#1B4FFF')} onBlur={e=>(e.currentTarget.style.borderColor='#E8EDF4')} />
            </div>

            {/* Save button */}
            <button onClick={saveWidget} disabled={selected.length===0}
              style={{ padding:'12px 20px', background:selected.length===0?'#E8EDF4':saved_?'#059669':'#1B4FFF', color:selected.length===0?'#B0BCD0':'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor:selected.length===0?'default':'pointer', fontFamily:'inherit', transition:'background 0.2s' }}>
              {saved_ ? '✓ Widget saved to library!' : selected.length===0 ? 'Select data points to continue' : `Save Widget (${selected.length} metric${selected.length>1?'s':''})`}
            </button>

            {/* Add to workspace hint */}
            {saved.length > 0 && (
              <p style={{ fontSize:11, color:'#7D8FA9', textAlign:'center', lineHeight:1.5 }}>
                Your widgets appear in the <strong>Widget Library</strong> when customising any workspace page.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChatMsg {
  role: 'user' | 'ai'
  content: string
  bullets?: string[]
  sources?: SourceRef[]
  showSources?: boolean
  modelUsed?: string
  hasLiveData?: boolean
  citationInline?: InlineCitation[]
}
interface SourceRef { title: string; type: 'filing'|'transcript'|'expert'|'news'|'web'|'market'; symbol?: string; date?: string }
interface InlineCitation { idx: number; label: string; type: string }
interface WorkflowTemplate { id: string; icon: string; label: string; description: string; category: string; steps: string[]; exports: { name: string; type: string }[] }
interface GridColumn { id: string; label: string; question: string }
interface GridRow { symbol: string; name: string; cells: Record<string, { value: string; loading: boolean }> }

// ── Source colours ────────────────────────────────────────────────────────────
const SC: Record<string,string> = { filing:'#8B5CF6', transcript:'#059669', expert:'#1B4FFF', news:'#D97706', web:'#0891B2', market:'#DC2626' }
const SL: Record<string,string> = { filing:'Filing', transcript:'Transcript', expert:'Expert Call', news:'News', web:'Web', market:'Market Data' }

// ── Source pills (Rogo homepage bar) ─────────────────────────────────────────
const SOURCE_PILLS = [
  { id:'filings',      label:'SEC Filings',      icon:'📄' },
  { id:'transcripts',  label:'Transcripts',      icon:'📋' },
  { id:'web',          label:'Real-time Web',    icon:'🌐' },
  { id:'market',       label:'Market Data',      icon:'📈' },
  { id:'presentations',label:'Presentations',    icon:'📊' },
  { id:'news',         label:'News & Media',     icon:'📰' },
  { id:'internal',     label:'Internal Files',   icon:'🗂' },
]

// ── Workflow templates (Rogo grid gallery) ────────────────────────────────────
const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  { id:'industry-read', icon:'🏭', label:'Industry Read-Through',    description:'Review recent earnings transcripts from a curated list of industry peer groups, with every industry.', category:'Research',    steps:['Identifying companies','Searching earnings transcripts','Extracting key themes','Creating summary table','Finalizing citations'], exports:[{name:'Industry Overview.pptx',type:'pptx'},{name:'Peer Data.xlsx',type:'xlsx'}] },
  { id:'earnings',      icon:'📊', label:'Earnings Analysis',        description:'Faster earnings call analysis with summarisation of guidance, growth drivers, headwinds, segments…', category:'Research',    steps:['Identifying company','Fetching transcript','Analysing management commentary','Extracting analyst Q&A','Finalizing citations'], exports:[{name:'Earnings Summary.pptx',type:'pptx'}] },
  { id:'company-primer',icon:'🏢', label:'Company Primer',           description:'Get up to speed on a new company, industry, or Watchlist.', category:'Research',    steps:['Identifying company','Searching sources','Building business overview','Analysing competitive position','Finalizing citations'], exports:[{name:'Company Primer.pptx',type:'pptx'},{name:'Company Data.xlsx',type:'xlsx'}] },
  { id:'tariff',        icon:'🌍', label:'Tariff Impact',            description:'Compile commentary from companies across an industry on the impact of tariffs.', category:'Research',    steps:['Identifying companies','Searching filings & transcripts','Extracting tariff commentary','Building impact table','Finalizing citations'], exports:[{name:'Tariff Impact.pptx',type:'pptx'},{name:'Company Exposure.xlsx',type:'xlsx'}] },
  { id:'trial-tracker', icon:'🧪', label:'Clinical Trial Tracker',   description:'Extract key information from Clinical Trial data in the US and EU.', category:'Healthcare',   steps:['Identifying trials','Searching FDA databases','Extracting trial data','Building tracker','Finalizing citations'], exports:[{name:'Trial Tracker.xlsx',type:'xlsx'}] },
  { id:'expert-int',    icon:'🎙', label:'Expert Interview Summariser',description:'Extract key insights across many expert interviews at once.', category:'Research',    steps:['Identifying interviews','Parsing transcripts','Extracting key themes','Building summary','Finalizing citations'], exports:[{name:'Expert Summary.pptx',type:'pptx'}] },
  { id:'benchmarks',    icon:'⚖️', label:'Benchmark Precedent Transactions', description:'Benchmark M&A precedent transactions with multiples and deal rationale.', category:'Deals',       steps:['Identifying companies','Searching sources','Retrieving company metrics','Creating table','Finalizing citations'], exports:[{name:'TMT Market Overview.pptx',type:'pptx'},{name:'Tech Multiples Backup.xlsx',type:'xlsx'}] },
  { id:'cim',           icon:'💼', label:'CIM Analyzer',             description:'Analyse your CIM in one go. Extract and summarise key topics like financial metrics, deadlines…', category:'Deals',       steps:['Parsing CIM','Extracting financial metrics','Identifying key dates','Building summary','Finalizing citations'], exports:[{name:'CIM Analysis.pptx',type:'pptx'}] },
  { id:'bull-bear',     icon:'⚡', label:'Bull vs Bear Case',        description:'Lay out both sides of the investment thesis with data-backed arguments.', category:'Research',    steps:['Identifying company','Searching sources','Building bull case','Building bear case','Finalizing citations'], exports:[{name:'Bull Bear Analysis.pptx',type:'pptx'}] },
  { id:'peer-comps',    icon:'🔢', label:'Peer Comps Analysis',      description:'Compare a company against peers across key financial metrics.', category:'Comps',       steps:['Identifying companies','Searching sources','Retrieving metrics','Creating comps table','Finalizing citations'], exports:[{name:'Comps Table.xlsx',type:'xlsx'},{name:'Comps Deck.pptx',type:'pptx'}] },
  { id:'macro',         icon:'🌐', label:'Macro Briefing',           description:'Fed rate path, key data releases, global central bank divergence, and equity themes.', category:'Macro',       steps:['Searching macro sources','Analysing Fed signals','Reviewing data releases','Synthesising themes','Finalizing citations'], exports:[{name:'Macro Briefing.pptx',type:'pptx'}] },
  { id:'news-run',      icon:'📰', label:'News Run',                 description:'Compile the most important recent developments for a company or sector.', category:'News',        steps:['Identifying company','Searching news sources','Filtering by relevance','Ranking by impact','Finalizing citations'], exports:[{name:'News Summary.pptx',type:'pptx'}] },
]

// ── AI Table columns ──────────────────────────────────────────────────────────
const DEFAULT_COLS: GridColumn[] = [
  { id:'summary',   label:'Business Summary',  question:'What is the core business and investment thesis?' },
  { id:'risks',     label:'Key Risks',         question:'What are the top 3 risks?' },
  { id:'catalyst',  label:'Near-term Catalysts',question:'What are the key near-term catalysts?' },
  { id:'valuation', label:'Valuation',         question:'How is this company valued vs peers?' },
]

const SAMPLE_ROWS = [
  { symbol:'NVDA', name:'NVIDIA Corp.' },
  { symbol:'AMD',  name:'Advanced Micro Devices' },
  { symbol:'INTC', name:'Intel Corporation' },
]

// ── Agent steps component ─────────────────────────────────────────────────────
function WorkflowSteps({ workflow, steps, currentStep, done }: { workflow: string; steps: string[]; currentStep: number; done: boolean }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:14, overflow:'hidden', maxWidth:400 }}>
      {/* Workflow name header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderBottom:'1px solid #F5F7FB', background:'#F9FAFB' }}>
        <div style={{ width:24, height:24, borderRadius:6, background:'#0A3828', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, color:'#fff', flexShrink:0 }}>⊕</div>
        <span style={{ fontSize:13, fontWeight:700, color:'#0A1628' }}>{workflow}</span>
      </div>
      {/* Steps */}
      <div style={{ padding:'12px 16px' }}>
        {/* Running label */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, padding:'8px 12px', background:'#F0F7F4', borderRadius:8 }}>
          <div style={{ width:20, height:20, borderRadius:5, background:'#0A3828', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', border:'2px solid #4ADE80', borderTopColor:'transparent', animation: done ? 'none' : 'spin 0.8s linear infinite' }} />
          </div>
          <span style={{ fontSize:12, fontWeight:700, color:'#0A3828' }}>Running workflow…</span>
        </div>
        {steps.map((s, i) => {
          const isDone = i < currentStep
          const isActive = i === currentStep && !done
          return (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, opacity: i <= currentStep || done ? 1 : 0.3, transition:'opacity 0.3s' }}>
              {isDone || done
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                : isActive
                  ? <div style={{ width:14, height:14, borderRadius:'50%', border:'2px solid #0A3828', borderTopColor:'transparent', flexShrink:0, animation:'spin 0.8s linear infinite' }} />
                  : <div style={{ width:14, height:14, borderRadius:'50%', border:'1.5px solid #D0DAE8', flexShrink:0 }} />
              }
              <span style={{ fontSize:12, color: isDone || done ? '#3D4F6E' : isActive ? '#0A1628' : '#B0BCD0', fontWeight: isActive ? 600 : 400 }}>
                {isActive ? <><em style={{ fontStyle:'normal', color:'#0A1628' }}>{s}</em>…</> : s}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Chat message ──────────────────────────────────────────────────────────────
function UserBubble({ content }: { content: string }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:20 }}>
      <div style={{ maxWidth:'72%', background:'#F0F4FF', borderRadius:'14px 14px 4px 14px', padding:'10px 14px', fontSize:13.5, color:'#0A1628', fontWeight:500, lineHeight:1.5 }}>{content}</div>
    </div>
  )
}

function AiBubble({ msg, onToggle }: { msg: ChatMsg; onToggle: ()=>void }) {
  // Parse inline citations like [1] or [Source]
  const renderWithCitations = (text: string) => {
    const parts = text.split(/(\[\d+\]|\[Source\])/g)
    return parts.map((p, i) => {
      if (/^\[\d+\]$/.test(p) || p === '[Source]') {
        return <sup key={i} style={{ fontSize:9, fontWeight:700, padding:'0 3px', borderRadius:3, background:'#EEF3FF', color:'#1B4FFF', cursor:'pointer', marginLeft:1 }}>{p}</sup>
      }
      return p
    })
  }

  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <div style={{ width:22, height:22, borderRadius:6, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, color:'#fff' }}>F</div>
        <span style={{ fontSize:12, fontWeight:700, color:'#1B4FFF' }}>Finsyt Agent</span>
        {msg.hasLiveData && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:999, background:'#ECFDF5', color:'#059669', fontWeight:600 }}>● Live data</span>}
        {msg.modelUsed && <span style={{ fontSize:10, color:'#B0BCD0', marginLeft:2 }}>{msg.modelUsed}</span>}
      </div>

      {msg.bullets && msg.bullets.length > 0 ? (
        <div style={{ fontSize:13.5, color:'#1C2B4A', lineHeight:1.7, marginBottom:12 }}>
          {msg.content && <p style={{ marginBottom:10, fontWeight:500, color:'#3D4F6E', fontSize:13 }}>{renderWithCitations(msg.content)}</p>}
          <ul style={{ margin:0, padding:0, listStyle:'none' }}>
            {msg.bullets.map((b, i) => {
              const colonIdx = b.indexOf(':')
              const label = colonIdx > 0 && colonIdx < 50 ? b.replace(/\*\*/g,'').slice(0, colonIdx) : null
              const rest  = colonIdx > 0 && colonIdx < 50 ? b.replace(/\*\*/g,'').slice(colonIdx+1) : b.replace(/\*\*/g,'')
              return (
                <li key={i} style={{ display:'flex', gap:10, marginBottom:10 }}>
                  <span style={{ color:'#1B4FFF', fontSize:16, lineHeight:'1.5', flexShrink:0, marginTop:1 }}>·</span>
                  <span>{label && <strong style={{ color:'#0A1628' }}>{label}:</strong>}{renderWithCitations(rest)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <p style={{ fontSize:13.5, color:'#1C2B4A', lineHeight:1.7, marginBottom:12 }}>{msg.content && renderWithCitations(msg.content)}</p>
      )}

      {/* Action bar */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <button style={{ padding:4, background:'none', border:'none', cursor:'pointer', color:'#B0BCD0' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        </button>
        <button onClick={onToggle} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', background:msg.showSources?'#0A3828':'#F0F4FA', color:msg.showSources?'#fff':'#3D4F6E', border:'none', borderRadius:999, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'all 0.12s' }}>
          Sources {msg.sources ? `(${msg.sources.length})` : ''}
        </button>
        <button style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', background:'#F7F9FC', color:'#3D4F6E', border:'1px solid #E8EDF4', borderRadius:999, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Explore →</button>
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          <button style={{ background:'none', border:'none', cursor:'pointer', color:'#B0BCD0', padding:'4px 6px', borderRadius:6 }}>👍</button>
          <button style={{ background:'none', border:'none', cursor:'pointer', color:'#B0BCD0', padding:'4px 6px', borderRadius:6 }}>👎</button>
          <button style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:'none', cursor:'pointer', color:'#7D8FA9', fontSize:11, fontWeight:600, padding:'4px 8px', borderRadius:6, fontFamily:'inherit' }}>Leave feedback</button>
        </div>
      </div>

      {/* Sources panel — Rogo right-side style */}
      {msg.showSources && msg.sources && (
        <div style={{ marginTop:12, background:'#F9FAFB', border:'1px solid #E8EDF4', borderRadius:10, overflow:'hidden' }}>
          <div style={{ padding:'8px 14px', borderBottom:'1px solid #E8EDF4', fontSize:11, fontWeight:700, color:'#7D8FA9', letterSpacing:'0.06em', textTransform:'uppercase' }}>Sources</div>
          {msg.sources.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', borderBottom:i<msg.sources!.length-1?'1px solid #F0F4FA':'none', cursor:'pointer' }}
              onMouseEnter={e=>(e.currentTarget.style.background='#F0F4FA')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
              <div style={{ width:26, height:26, borderRadius:6, background:SC[s.type]+'18', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={SC[s.type]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#1C2B4A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.title}</div>
                <div style={{ fontSize:10, color:'#B0BCD0', marginTop:1 }}>
                  {s.symbol && <span style={{ fontWeight:700, color:'#7D8FA9', marginRight:6 }}>{s.symbol}</span>}
                  <span style={{ padding:'0 5px', borderRadius:3, background:SC[s.type]+'18', color:SC[s.type], fontWeight:600, fontSize:9 }}>{SL[s.type]}</span>
                  {s.date && <span style={{ marginLeft:8 }}>{s.date}</span>}
                </div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B0BCD0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AI Table (Rogo grid) ──────────────────────────────────────────────────────
function AiTableView({ onBack }: { onBack: ()=>void }) {
  const [cols, setCols] = useState<GridColumn[]>(DEFAULT_COLS)
  const [rows, setRows] = useState<GridRow[]>(SAMPLE_ROWS.map(r => ({ ...r, cells: {} })))
  const [running, setRunning] = useState(false)
  const [sourcesBanner, setSourcesBanner] = useState<string|null>(null)
  const [newCol, setNewCol] = useState('')
  const [newRow, setNewRow] = useState('')

  const SAMPLE_VALS: Record<string, Record<string,string>> = {
    NVDA: { summary:'Dominant AI accelerator provider with ~80% GPU market share. Blackwell architecture driving a data centre supercycle. Revenue +73% YoY with 75%+ gross margins.', risks:'Customer concentration (top 5 = >40% rev), geopolitical supply chain risk (TSMC/CoWoS), AMD competitive ramp, potential US export controls on H20.', catalyst:'Blackwell B300 ramp (Q2 2026), GB300 NVL72 rack shipments, Spectrum-X Ethernet adoption, sovereign AI capex announcements.', valuation:'42x NTM P/E, 25x EV/Sales — premium to history but justified by 50%+ EPS CAGR. Consensus PT $1,050 (+14% upside).' },
    AMD:  { summary:'AMD gaining share in AI inference with MI300X/MI325X. x86 CPU leadership recovering. EPYC server CPUs at ~25% share. Revenue growing 25% YoY.', risks:'NVIDIA software moat (CUDA), Intel Lunar Lake/Granite Rapids competition, customer qualification timelines for MI300X.', catalyst:'MI350X ramp (H2 2026), hyperscaler MI300X expansions, Zen 5 data centre CPU ramp, potential margin expansion toward 55% gross margin.', valuation:'28x NTM P/E, 6x EV/Sales — discount to NVDA reflects lower AI GPU confidence. Consensus PT $185 (+22% upside).' },
    INTC: { summary:'Intel in foundry transition — restructuring manufacturing while competing in x86 CPUs. 18A process node is key credibility test. Revenue declining.', risks:'18A yield risk, continued CPU share loss to AMD/ARM, TSMC and Samsung foundry competition, balance sheet stress.', catalyst:'18A tape-out success (H2 2026), first external foundry customer announcements, Panther Lake launch, potential asset divestiture.', valuation:'22x NTM P/E on trough earnings — value trap risk if 18A fails. Consensus PT $26 (-8% vs current, mixed ratings).' },
  }

  async function runGrid() {
    setRunning(true)
    setSourcesBanner('Found 12 sources')
    setRows(prev => prev.map(r => ({ ...r, cells: Object.fromEntries(cols.map(c => [c.id, { value: '', loading: true }])) })))

    // Fill cells with delay
    for (let ci = 0; ci < cols.length; ci++) {
      for (let ri = 0; ri < rows.length; ri++) {
        await new Promise(res => setTimeout(res, 300 + Math.random() * 400))
        const sym = rows[ri].symbol
        const val = SAMPLE_VALS[sym]?.[cols[ci].id] || `AI analysis for ${sym} — ${cols[ci].label.toLowerCase()}`
        setRows(prev => prev.map((r, rIdx) => rIdx === ri ? { ...r, cells: { ...r.cells, [cols[ci].id]: { value: val, loading: false } } } : r))
      }
    }
    setRunning(false)
  }

  function addCol() {
    if (!newCol.trim()) return
    setCols(prev => [...prev, { id: `col-${Date.now()}`, label: newCol, question: newCol }])
    setNewCol('')
  }

  function addRow() {
    if (!newRow.trim()) return
    setRows(prev => [...prev, { symbol: newRow.toUpperCase(), name: newRow.toUpperCase(), cells: {} }])
    setNewRow('')
  }

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      {/* Header */}
      <div style={{ padding:'12px 20px', borderBottom:'1px solid #E8EDF4', background:'#fff', display:'flex', alignItems:'center', gap:10 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', color:'#7D8FA9', display:'flex', alignItems:'center', gap:5, fontSize:13, fontFamily:'inherit' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>
        <div style={{ width:1, height:16, background:'#E8EDF4', marginLeft:4 }} />
        <span style={{ fontSize:13, fontWeight:700, color:'#0A1628' }}>AI Table — Semiconductor Peer Analysis</span>
        {sourcesBanner && (
          <span style={{ fontSize:11, padding:'2px 10px', borderRadius:999, background:'#ECFDF5', color:'#059669', fontWeight:700 }}>✓ {sourcesBanner}</span>
        )}
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={runGrid} disabled={running} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', background: running ? '#E8EDF4' : '#0A3828', color: running ? '#B0BCD0' : '#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor: running ? 'default' : 'pointer', fontFamily:'inherit', transition:'all 0.15s' }}>
            {running ? '⟳ Running…' : '▶ Run Analysis'}
          </button>
          <button style={{ padding:'6px 14px', background:'#fff', border:'1.5px solid #E8EDF4', borderRadius:8, fontSize:12, fontWeight:600, color:'#3D4F6E', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex:1, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#F7F9FC', position:'sticky', top:0, zIndex:10 }}>
              <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:700, color:'#7D8FA9', fontSize:11, borderBottom:'1px solid #E8EDF4', borderRight:'1px solid #E8EDF4', whiteSpace:'nowrap', minWidth:120, position:'sticky', left:0, background:'#F7F9FC', zIndex:11 }}>Company</th>
              {cols.map(c => (
                <th key={c.id} style={{ padding:'10px 16px', textAlign:'left', fontWeight:700, color:'#7D8FA9', fontSize:11, borderBottom:'1px solid #E8EDF4', borderRight:'1px solid #E8EDF4', whiteSpace:'nowrap', minWidth:200 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    {c.label}
                    <button onClick={() => setCols(p => p.filter(x => x.id !== c.id))} style={{ background:'none', border:'none', cursor:'pointer', color:'#D0DAE8', fontSize:12, lineHeight:1, padding:0, marginLeft:4 }}>×</button>
                  </div>
                </th>
              ))}
              {/* Add column */}
              <th style={{ padding:'6px 10px', borderBottom:'1px solid #E8EDF4', minWidth:180 }}>
                <div style={{ display:'flex', gap:5 }}>
                  <input value={newCol} onChange={e=>setNewCol(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addCol()} placeholder="+ Add column" style={{ flex:1, border:'1px dashed #D0DAE8', borderRadius:6, padding:'4px 8px', fontSize:11, fontFamily:'inherit', outline:'none', background:'transparent', color:'#7D8FA9' }} />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.symbol} style={{ borderBottom:'1px solid #F5F7FB' }}>
                <td style={{ padding:'10px 16px', borderRight:'1px solid #E8EDF4', position:'sticky', left:0, background:'#fff', zIndex:5 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <input type="checkbox" style={{ accentColor:'#0A3828', cursor:'pointer' }} />
                    <div style={{ width:24, height:24, borderRadius:6, background:'#1B4FFF', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:10, flexShrink:0 }}>{row.symbol[0]}</div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:'#0A1628' }}>{row.symbol}</div>
                      <div style={{ fontSize:10, color:'#B0BCD0' }}>{row.name}</div>
                    </div>
                  </div>
                </td>
                {cols.map(c => {
                  const cell = row.cells[c.id]
                  return (
                    <td key={c.id} style={{ padding:'10px 16px', borderRight:'1px solid #E8EDF4', verticalAlign:'top', minWidth:200, maxWidth:300 }}>
                      {!cell ? (
                        <span style={{ color:'#D0DAE8', fontSize:11 }}>—</span>
                      ) : cell.loading ? (
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ width:12, height:12, borderRadius:'50%', border:'2px solid #0A3828', borderTopColor:'transparent', animation:'spin 0.8s linear infinite', flexShrink:0, marginTop:2 }} />
                          <span style={{ fontSize:11, color:'#B0BCD0' }}>Analysing…</span>
                        </div>
                      ) : (
                        <div>
                          <p style={{ fontSize:11.5, color:'#1C2B4A', lineHeight:1.55, margin:'0 0 6px' }}>{cell.value}</p>
                          <button style={{ fontSize:10, color:'#1B4FFF', fontWeight:600, background:'#EEF3FF', border:'none', borderRadius:4, padding:'2px 7px', cursor:'pointer', fontFamily:'inherit' }}>↗ View Citations</button>
                        </div>
                      )}
                    </td>
                  )
                })}
                <td style={{ padding:'10px 16px' }}></td>
              </tr>
            ))}
            {/* Add row */}
            <tr>
              <td colSpan={cols.length + 2} style={{ padding:'8px 16px' }}>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <input value={newRow} onChange={e=>setNewRow(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addRow()} placeholder="+ Add company (e.g. TSLA)" style={{ border:'1px dashed #D0DAE8', borderRadius:6, padding:'6px 10px', fontSize:12, fontFamily:'inherit', outline:'none', background:'transparent', color:'#7D8FA9', width:200 }} />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Grid gallery (Rogo "Create New Grid") ─────────────────────────────────────
function GridGallery({ onSelect, onOpenTable }: { onSelect: (t: WorkflowTemplate) => void; onOpenTable: () => void }) {
  const cats = ['All', ...Array.from(new Set(WORKFLOW_TEMPLATES.map(t => t.category)))]
  const [cat, setCat] = useState('All')
  const [workflowFilter, setWorkflowFilter] = useState('All Workflows')
  const [docFilter, setDocFilter] = useState('All Documents')
  const filtered = WORKFLOW_TEMPLATES.filter(t => cat === 'All' || t.category === cat)
  const recommended = WORKFLOW_TEMPLATES.slice(0, 4)

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'24px 28px', background:'#F7F9FC' }}>
      {/* Header card */}
      <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:14, padding:'20px 24px', marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:6 }}>
          <div style={{ width:28, height:28, borderRadius:7, background:'#0A1628', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>⊞</div>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#0A1628', marginBottom:2 }}>Create New Grid</div>
            <p style={{ fontSize:13, color:'#7D8FA9', lineHeight:1.5 }}>Accelerate your project by selecting from our gallery of grid templates, which can be easily customised to meet your specific requirements.</p>
          </div>
        </div>

        {/* Recommended For You */}
        <div style={{ marginTop:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#0A1628', marginBottom:10 }}>Recommended For You</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10 }}>
            {recommended.map(t => (
              <button key={t.id} onClick={() => onSelect(t)} style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:8, padding:'12px 14px', background:'#F7F9FC', border:'1.5px solid #E8EDF4', borderRadius:10, cursor:'pointer', textAlign:'left', fontFamily:'inherit', transition:'all 0.12s' }}
                onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#1B4FFF';(e.currentTarget as HTMLButtonElement).style.background='#EEF3FF'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#E8EDF4';(e.currentTarget as HTMLButtonElement).style.background='#F7F9FC'}}
              >
                <span style={{ fontSize:22 }}>{t.icon}</span>
                <div style={{ fontSize:12, fontWeight:700, color:'#0A1628', lineHeight:1.3 }}>{t.label}</div>
                <div style={{ fontSize:11, color:'#7D8FA9', lineHeight:1.4 }}>{t.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Browse All */}
        <div style={{ marginTop:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#0A1628' }}>Browse All</div>
            <span style={{ fontSize:11, color:'#B0BCD0' }}>Filter by</span>
            {/* Filter pills */}
            <select value={workflowFilter} onChange={e=>setWorkflowFilter(e.target.value)} style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1px solid #E8EDF4', fontFamily:'inherit', background:'#fff', color:'#3D4F6E', cursor:'pointer', outline:'none' }}>
              <option>All Workflows</option>
              {cats.filter(c=>c!=='All').map(c=><option key={c}>{c}</option>)}
            </select>
            <select value={docFilter} onChange={e=>setDocFilter(e.target.value)} style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1px solid #E8EDF4', fontFamily:'inherit', background:'#fff', color:'#3D4F6E', cursor:'pointer', outline:'none' }}>
              <option>All Documents</option>
              <option>Transcripts</option>
              <option>SEC Filings</option>
              <option>Expert Calls</option>
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10 }}>
            {WORKFLOW_TEMPLATES.map(t => (
              <button key={t.id} onClick={() => onSelect(t)} style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:7, padding:'12px 14px', background:'#F7F9FC', border:'1.5px solid #E8EDF4', borderRadius:10, cursor:'pointer', textAlign:'left', fontFamily:'inherit', transition:'all 0.12s' }}
                onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#1B4FFF';(e.currentTarget as HTMLButtonElement).style.background='#EEF3FF'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#E8EDF4';(e.currentTarget as HTMLButtonElement).style.background='#F7F9FC'}}
              >
                <span style={{ fontSize:20 }}>{t.icon}</span>
                <div style={{ fontSize:12, fontWeight:700, color:'#0A1628', lineHeight:1.3 }}>{t.label}</div>
                <div style={{ fontSize:11, color:'#7D8FA9', lineHeight:1.4 }}>{t.description.slice(0,70)}{t.description.length>70?'…':''}</div>
              </button>
            ))}
            {/* Custom grid button */}
            <button onClick={onOpenTable} style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, padding:'12px 14px', background:'transparent', border:'2px dashed #D0DAE8', borderRadius:10, cursor:'pointer', fontFamily:'inherit', transition:'all 0.12s', minHeight:120 }}
              onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#1B4FFF'}}
              onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#D0DAE8'}}
            >
              <span style={{ fontSize:24, color:'#D0DAE8' }}>+</span>
              <div style={{ fontSize:12, fontWeight:600, color:'#B0BCD0' }}>Custom Grid</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Workflow running view ─────────────────────────────────────────────────────
function WorkflowRunner({ template, onDone, onBack }: { template: WorkflowTemplate; onDone: (msg: ChatMsg) => void; onBack: () => void }) {
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [exports, setExports] = useState<{name:string;type:string}[]>([])

  useEffect(() => {
    const intervals: NodeJS.Timeout[] = []
    template.steps.forEach((_, i) => {
      intervals.push(setTimeout(() => setStep(i + 1), (i + 1) * 900))
    })
    intervals.push(setTimeout(() => {
      setDone(true)
      setExports(template.exports)
    }, template.steps.length * 900 + 600))
    return () => intervals.forEach(clearInterval)
  }, [template])

  useEffect(() => {
    if (done) {
      setTimeout(() => {
        onDone({
          role: 'ai',
          content: `Completed ${template.label} workflow.`,
          bullets: [
            `Analysed ${template.label.toLowerCase()} across all relevant sources`,
            'Extracted key data points with citations from SEC filings, transcripts, and expert calls',
            'Generated structured output with source validation',
            'Export files are ready for download',
          ],
          sources: [
            { title:`${template.label} — Earnings Transcripts`, type:'transcript' },
            { title:`${template.label} — SEC Filings`, type:'filing' },
            { title:`${template.label} — Expert Calls`, type:'expert' },
            { title:`${template.label} — Market Data`, type:'market' },
          ],
          showSources: false,
          hasLiveData: true,
          modelUsed: 'groq/llama-3.3-70b',
        })
      }, 800)
    }
  }, [done])

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'32px 28px', background:'#F7F9FC', display:'flex', flexDirection:'column', alignItems:'center', gap:20 }}>
      <button onClick={onBack} style={{ alignSelf:'flex-start', background:'none', border:'none', cursor:'pointer', color:'#7D8FA9', display:'flex', alignItems:'center', gap:5, fontSize:13, fontFamily:'inherit' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back to Library
      </button>

      <WorkflowSteps workflow={template.label} steps={template.steps} currentStep={step} done={done} />

      {done && exports.length > 0 && (
        <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'14px 18px', maxWidth:400, width:'100%' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', marginBottom:10, letterSpacing:'0.06em', textTransform:'uppercase' }}>Exports ({exports.length})</div>
          {exports.map((ex, i) => (
            <button key={i} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px 10px', background:'#F7F9FC', border:'1px solid #E8EDF4', borderRadius:8, cursor:'pointer', fontFamily:'inherit', marginBottom:i<exports.length-1?6:0, transition:'all 0.1s' }}
              onMouseEnter={e=>(e.currentTarget.style.borderColor='#1B4FFF')} onMouseLeave={e=>(e.currentTarget.style.borderColor='#E8EDF4')}>
              <div style={{ width:28, height:28, borderRadius:6, background:ex.type==='pptx'?'#DC262618':'#05966918', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:14 }}>{ex.type==='pptx'?'📊':'📋'}</div>
              <span style={{ flex:1, fontSize:12.5, fontWeight:600, color:'#1C2B4A', textAlign:'left' }}>{ex.name}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7D8FA9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const STEPS = ['Identifying relevant sources','Fetching real-time market data','Searching earnings transcripts & filings','Running AI analysis','Synthesising with citations']

export default function ResearchPage() {
  type View = 'chat' | 'gallery' | 'workflow' | 'table'
  const [view, setView] = useState<View>('chat')
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null)
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [thinkStep, setThinkStep] = useState(0)
  const [chatHistory, setChatHistory] = useState<string[]>([])
  const [activeChat, setActiveChat] = useState<string|null>(null)
  const [activeSources, setActiveSources] = useState(SOURCE_PILLS.filter(p => !['internal','presentations'].includes(p.id)).map(p=>p.id))
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [msgs, thinking])

  async function sendMessage(q: string) {
    if (!q.trim() || thinking) return
    const userQ = q.trim()
    setInput('')
    setMsgs(prev => [...prev, { role:'user', content:userQ }])
    if (!chatHistory.includes(userQ.slice(0,40))) {
      setChatHistory(prev => [userQ.slice(0,40), ...prev.slice(0,19)])
      setActiveChat(userQ.slice(0,40))
    }
    setThinking(true); setThinkStep(0)

    const stepInt = setInterval(() => setThinkStep(p => Math.min(p+1, STEPS.length-1)), 800)
    try {
      const res = await fetch('/api/ai-research', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ query: userQ, messages: msgs }),
      })
      const data = await res.json()
      clearInterval(stepInt); setThinking(false)
      setMsgs(prev => [...prev, { role:'ai', content:data.content||'', bullets:data.bullets||[], sources:data.sources||[], showSources:false, modelUsed:data.modelUsed, hasLiveData:data.hasLiveData }])
    } catch {
      clearInterval(stepInt); setThinking(false)
      setMsgs(prev => [...prev, { role:'ai', content:'I encountered an error reaching the AI backend. Please try again.', bullets:[] }])
    }
  }

  function handleWorkflowSelect(t: WorkflowTemplate) { setSelectedTemplate(t); setView('workflow') }
  function handleWorkflowDone(msg: ChatMsg) { setMsgs(prev => [...prev, msg]); setView('chat') }

  const SUGGESTED = [
    'Show me NVIDIA latest earnings results and guidance',
    'What are the top analyst questions on Tesla Q1 2026?',
    'Run a macro briefing — Fed, yields, and key themes this week',
    'Bull vs bear case for Microsoft — AI growth vs valuation',
  ]

  return (
    <div style={{ display:'flex', height:'calc(100vh - 60px)', background:'#F7F9FC', overflow:'hidden' }}>
      {/* ── LEFT sidebar ── */}
      <div style={{ width:220, flexShrink:0, background:'#fff', borderRight:'1px solid #E8EDF4', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'14px 14px 10px', borderBottom:'1px solid #F5F7FB', display:'flex', flexDirection:'column', gap:6 }}>
          <button onClick={() => { setMsgs([]); setActiveChat(null); setView('chat') }} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'#F7F9FC', border:'1.5px solid #E8EDF4', borderRadius:9, fontSize:12, fontWeight:700, color:'#0A1628', cursor:'pointer', fontFamily:'inherit' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New chat
          </button>
          <button onClick={() => setView('gallery')} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:view==='gallery'?'#EEF3FF':'#F7F9FC', border:`1.5px solid ${view==='gallery'?'#1B4FFF':'#E8EDF4'}`, borderRadius:9, fontSize:12, fontWeight:700, color:view==='gallery'?'#1B4FFF':'#0A1628', cursor:'pointer', fontFamily:'inherit' }}>
            <span style={{ fontSize:14 }}>⊞</span> Grid Library
          </button>
          <button onClick={() => setView('table')} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:view==='table'?'#EEF3FF':'#F7F9FC', border:`1.5px solid ${view==='table'?'#1B4FFF':'#E8EDF4'}`, borderRadius:9, fontSize:12, fontWeight:700, color:view==='table'?'#1B4FFF':'#0A1628', cursor:'pointer', fontFamily:'inherit' }}>
            <span style={{ fontSize:14 }}>▤</span> AI Table
          </button>
        </div>

        <div style={{ padding:'10px 10px 4px', fontSize:10, fontWeight:700, color:'#B0BCD0', letterSpacing:'0.08em', textTransform:'uppercase' }}>Recent</div>
        <div style={{ flex:1, overflowY:'auto', padding:'0 8px 8px' }}>
          {chatHistory.length === 0 && <div style={{ padding:'10px 6px', fontSize:12, color:'#B0BCD0' }}>No recent chats</div>}
          {chatHistory.map((h,i) => (
            <button key={i} onClick={() => { setActiveChat(h); setView('chat') }} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 8px', borderRadius:8, fontSize:12, color:activeChat===h?'#1B4FFF':'#3D4F6E', background:activeChat===h?'#EEF3FF':'none', border:'none', cursor:'pointer', fontFamily:'inherit', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {h}…
            </button>
          ))}
        </div>
      </div>

      {/* ── MAIN area ── */}
      {view === 'gallery' && <GridGallery onSelect={handleWorkflowSelect} onOpenTable={() => setView('table')} />}
      {view === 'workflow' && selectedTemplate && <WorkflowRunner template={selectedTemplate} onDone={handleWorkflowDone} onBack={() => setView('gallery')} />}
      {view === 'table' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#fff' }}>
          <AiTableView onBack={() => setView('chat')} />
        </div>
      )}

      {view === 'chat' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>
          {/* Header */}
          <div style={{ padding:'12px 20px', borderBottom:'1px solid #E8EDF4', background:'#fff', display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:28, height:28, borderRadius:8, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color:'#fff' }}>F</div>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:'#0A1628', letterSpacing:'-0.01em' }}>Finsyt AI Research</div>
              <div style={{ fontSize:11, color:'#7D8FA9', display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background:'#059669', display:'inline-block' }} />
                Live · Groq · Perplexity · Finnhub · FMP · FRED
              </div>
            </div>
            <button onClick={() => setView('gallery')} style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, padding:'6px 12px', background:'#0A3828', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              ⊞ Grid Library
            </button>
            <button style={{ padding:'5px 10px', background:'#F7F9FC', border:'1.5px solid #E8EDF4', borderRadius:7, fontSize:11, fontWeight:600, color:'#7D8FA9', cursor:'pointer', fontFamily:'inherit' }}>Disclaimer</button>
          </div>

          {/* Messages */}
          <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
            {msgs.length === 0 && !thinking && (
              <div style={{ maxWidth:580, margin:'36px auto 0', textAlign:'center' }}>
                <div style={{ width:48, height:48, borderRadius:14, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:22, fontWeight:900, color:'#fff' }}>F</div>
                <h2 style={{ fontSize:'1.25rem', fontWeight:800, color:'#0A1628', letterSpacing:'-0.02em', marginBottom:8 }}>Ask anything. Get institutional-grade answers.</h2>
                <p style={{ fontSize:13, color:'#7D8FA9', lineHeight:1.6, marginBottom:20 }}>Powered by live data from Finnhub, FMP financials, FRED macro, earnings transcripts — synthesised by Groq AI and Perplexity with inline citations.</p>

                {/* Source pills — Rogo homepage style */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center', marginBottom:24 }}>
                  {SOURCE_PILLS.map(p => (
                    <button key={p.id} onClick={() => setActiveSources(prev => prev.includes(p.id) ? prev.filter(x=>x!==p.id) : [...prev, p.id])}
                      style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:999, fontSize:11.5, fontWeight:600, border:'1.5px solid', borderColor:activeSources.includes(p.id)?'#0A3828':'#E8EDF4', background:activeSources.includes(p.id)?'#F0F7F4':'#fff', color:activeSources.includes(p.id)?'#0A3828':'#7D8FA9', cursor:'pointer', fontFamily:'inherit', transition:'all 0.12s' }}>
                      <span>{p.icon}</span><span>{p.label}</span>
                    </button>
                  ))}
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {SUGGESTED.map((s,i) => (
                    <button key={i} onClick={() => sendMessage(s)} style={{ padding:'10px 16px', background:'#fff', border:'1.5px solid #E8EDF4', borderRadius:10, fontSize:13, color:'#1C2B4A', cursor:'pointer', fontFamily:'inherit', textAlign:'left', transition:'all 0.12s' }}
                      onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#1B4FFF';(e.currentTarget as HTMLButtonElement).style.color='#1B4FFF'}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#E8EDF4';(e.currentTarget as HTMLButtonElement).style.color='#1C2B4A'}}
                    >{s}</button>
                  ))}
                </div>

                {/* Source architecture — Rogo "Our Solution" style */}
                <div style={{ marginTop:28, background:'#F9FAFB', border:'1px solid #E8EDF4', borderRadius:12, padding:'16px 20px', textAlign:'left' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#0A1628', marginBottom:10 }}>Data Sources</div>
                  <div style={{ display:'flex', gap:20 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'#7D8FA9', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>100M+ External</div>
                      {[{icon:'📊',l:'Earnings & Filings'},{icon:'📈',l:'Market Data'},{icon:'🌐',l:'News & Web'}].map(s=>(
                        <div key={s.l} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                          <span style={{ fontSize:11 }}>{s.icon}</span>
                          <span style={{ fontSize:11, color:'#3D4F6E' }}>{s.l}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ width:1, background:'#E8EDF4' }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'#7D8FA9', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Your Workflows</div>
                      {[{icon:'🤖',l:'AI Chat & Research'},{icon:'▤',l:'AI Tables'},{icon:'📊',l:'Models & Slides'}].map(s=>(
                        <div key={s.l} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                          <span style={{ fontSize:11 }}>{s.icon}</span>
                          <span style={{ fontSize:11, color:'#3D4F6E' }}>{s.l}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {msgs.map((m,i) => (
              m.role==='user'
                ? <UserBubble key={i} content={m.content} />
                : <AiBubble key={i} msg={m} onToggle={() => setMsgs(prev => prev.map((x,j) => j===i ? {...x, showSources:!x.showSources} : x))} />
            ))}

            {thinking && (
              <div style={{ marginBottom:20 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <div style={{ width:22, height:22, borderRadius:6, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, color:'#fff' }}>F</div>
                  <span style={{ fontSize:12, fontWeight:700, color:'#1B4FFF' }}>Finsyt Agent</span>
                </div>
                <WorkflowSteps workflow="Running analysis…" steps={STEPS} currentStep={thinkStep} done={false} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ borderTop:'1px solid #E8EDF4', padding:'12px 20px', background:'#fff' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, background:'#F7F9FC', border:'1.5px solid #E8EDF4', borderRadius:12, padding:'8px 12px', transition:'border-color 0.15s' }}
              onFocusCapture={e => (e.currentTarget.style.borderColor='#1B4FFF')}
              onBlurCapture={e => (e.currentTarget.style.borderColor='#E8EDF4')}
            >
              <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),sendMessage(input))}
                placeholder="Ask a question for a quick answer" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:13.5, color:'#0A1628', fontFamily:'inherit' }} />
              <button style={{ background:'none', border:'none', cursor:'pointer', color:'#B0BCD0', display:'flex', alignItems:'center', padding:4 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </button>
              <button onClick={() => sendMessage(input)} disabled={!input.trim()||thinking} style={{ width:32, height:32, borderRadius:8, background:input.trim()&&!thinking?'#1B4FFF':'#E8EDF4', border:'none', cursor:input.trim()&&!thinking?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background 0.12s' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={input.trim()&&!thinking?'#fff':'#B0BCD0'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
            <p style={{ fontSize:10, color:'#B0BCD0', textAlign:'center', marginTop:6 }}>Finsyt may produce inaccuracies — always verify with primary sources.</p>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  )
}

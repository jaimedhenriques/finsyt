'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import AIMessage from '@/components/AIMessage'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// ── Types ─────────────────────────────────────────────────────────────────────
interface Workspace {
  id:          string
  name:        string
  description: string
  createdAt:   string
  updatedAt:   string
  pinned:      boolean
  messageCount: number
  lastMessage: string
  tags:        string[]
  color:       string
}

interface Message {
  id:        string
  role:      'user' | 'ai'
  content:   string
  timestamp: string
  sources?:  string[]
  citations?: string[]
}

const WORKSPACE_COLORS = ['var(--accent)','var(--pos)','var(--amber)','#7C3AED','var(--neg)','#0D9FE8']

const DEMO_WORKSPACES: Workspace[] = [
  {
    id:'ws1', name:'NVDA Deep Dive', description:'Full analysis of NVIDIA — earnings thesis, valuation, AI tailwinds',
    createdAt:'2026-04-10', updatedAt:'2026-04-13', pinned:true, messageCount:14, lastMessage:'What is NVDA\'s data center revenue trajectory?',
    tags:['semiconductors','AI','buy-side'], color:'var(--accent)',
  },
  {
    id:'ws2', name:'Q2 Earnings Preview', description:'Tracking upcoming earnings + consensus vs actual',
    createdAt:'2026-04-08', updatedAt:'2026-04-12', pinned:true, messageCount:7,  lastMessage:'Which S&P 500 companies report next week?',
    tags:['earnings','macro'], color:'var(--pos)',
  },
  {
    id:'ws3', name:'UK Macro Monitor', description:'BOE policy, inflation data, FTSE positioning',
    createdAt:'2026-04-05', updatedAt:'2026-04-11', pinned:false, messageCount:5,  lastMessage:'What did the BOE say about rate cuts?',
    tags:['macro','UK','rates'], color:'var(--amber)',
  },
  {
    id:'ws4', name:'M&A Pipeline', description:'Tracking deal flow, rumours, recent transactions',
    createdAt:'2026-04-01', updatedAt:'2026-04-09', pinned:false, messageCount:3,  lastMessage:'Recent tech M&A deals over $1B',
    tags:['M&A','deals'], color:'#7C3AED',
  },
]

const PROMPT_LIBRARY = [
  { label:'Earnings quality', prompt:'Analyse the earnings quality for {symbol} — focus on cash conversion, recurring vs one-time items, and guidance credibility' },
  { label:'Bull vs Bear', prompt:'Give me a rigorous bull case AND bear case for {symbol} with equal depth. What would break each thesis?' },
  { label:'Comps table', prompt:'Build a comparable company analysis for {symbol} — EV/EBITDA, P/E, EV/Revenue vs sector peers' },
  { label:'FCF analysis', prompt:'Analyse the free cash flow profile of {symbol} — FCF margin trends, capex intensity, working capital dynamics' },
  { label:'Insider activity', prompt:'What does recent insider trading tell us about {symbol}? Cluster buys vs sells, executive patterns' },
  { label:'Macro risk', prompt:'What macro factors pose the greatest risk to {symbol}\'s valuation over the next 12 months?' },
]

export default function WorkspacesPage() {
  const [view, setView]             = useState<'list' | 'chat'>('list')
  const [workspaces, setWorkspaces] = useState<Workspace[]>(DEMO_WORKSPACES)
  const [active, setActive]         = useState<Workspace | null>(null)
  const [messages, setMessages]     = useState<Message[]>([])
  const [input, setInput]           = useState('')
  const [sending, setSending]       = useState(false)
  const [showNew, setShowNew]       = useState(false)
  const [newForm, setNewForm]       = useState({ name:'', description:'', tags:'' })
  const [searchQ, setSearchQ]       = useState('')
  const [symbol, setSymbol]         = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages])

  function openWorkspace(ws: Workspace) {
    setActive(ws)
    setMessages([
      {
        id:'0', role:'ai', timestamp: new Date().toISOString(),
        content: `Welcome back to **${ws.name}**. ${ws.description}\n\nYou have ${ws.messageCount} previous messages in this workspace. What would you like to explore?`,
      }
    ])
    setView('chat')
  }

  function createWorkspace() {
    if (!newForm.name) return
    const ws: Workspace = {
      id:           Date.now().toString(),
      name:         newForm.name,
      description:  newForm.description,
      createdAt:    new Date().toISOString().slice(0,10),
      updatedAt:    new Date().toISOString().slice(0,10),
      pinned:       false,
      messageCount: 0,
      lastMessage:  '',
      tags:         newForm.tags.split(',').map(t => t.trim()).filter(Boolean),
      color:        WORKSPACE_COLORS[Math.floor(Math.random() * WORKSPACE_COLORS.length)],
    }
    setWorkspaces(prev => [ws, ...prev])
    setNewForm({ name:'', description:'', tags:'' })
    setShowNew(false)
    openWorkspace(ws)
  }

  async function sendMessage() {
    if (!input.trim() || sending) return
    const userMsg: Message = { id: Date.now().toString(), role:'user', content: input.trim(), timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    const q = input.trim()
    setInput('')
    setSending(true)

    try {
      const res  = await fetch(`${BASE}/api/ai-research`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          query: q,
          symbol: symbol || undefined,
          messages: messages.slice(-8),
          contextLevel: 'full',
        }),
      })
      const data = await res.json()
      const aiMsg: Message = {
        id:       Date.now().toString() + '_ai',
        role:     'ai',
        content:  data.answer || data.content || data.response || 'No response received.',
        timestamp: new Date().toISOString(),
        sources:  data.sources || [],
        citations: data.citations || [],
      }
      setMessages(prev => [...prev, aiMsg])
      // Update workspace last message
      if (active) {
        setWorkspaces(prev => prev.map(ws =>
          ws.id === active.id ? { ...ws, lastMessage: q, messageCount: ws.messageCount + 1, updatedAt: new Date().toISOString().slice(0,10) } : ws
        ))
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '_err', role:'ai', timestamp: new Date().toISOString(),
        content: 'Failed to get a response. Please try again.',
      }])
    } finally { setSending(false) }
  }

  function applyPrompt(p: string) {
    setInput(p.replace('{symbol}', symbol || 'the company'))
  }

  const filtered = workspaces.filter(ws =>
    !searchQ || ws.name.toLowerCase().includes(searchQ.toLowerCase()) || ws.tags.some(t => t.includes(searchQ.toLowerCase()))
  )
  const pinned   = filtered.filter(ws => ws.pinned)
  const unpinned = filtered.filter(ws => !ws.pinned)

  // ── LIST VIEW ───────────────────────────────────────────────────────────────
  if (view === 'list') return (
    <div className="page-content">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title">Workspaces</h1>
          <p style={{ fontSize:13, marginTop:2, color:'#7D8FA9' }}>Persistent research threads — each workspace is a dedicated AI analyst context</p>
        </div>
        <button onClick={() => setShowNew(true)}
          style={{ padding:'8px 16px', borderRadius:10, border:'none', background:'var(--gradient-brand)', color: '#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
          + New Workspace
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom:20 }}>
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search workspaces by name or tag…"
          style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
      </div>

      {/* Pinned */}
      {pinned.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#B0BCD0', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>📌 Pinned</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:12 }}>
            {pinned.map(ws => <WorkspaceCard key={ws.id} ws={ws} onOpen={openWorkspace} onTogglePin={id => setWorkspaces(p => p.map(w => w.id===id?{...w,pinned:!w.pinned}:w))} />)}
          </div>
        </div>
      )}

      {/* All */}
      <div>
        {pinned.length > 0 && <div style={{ fontSize:11, fontWeight:700, color:'#B0BCD0', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>All Workspaces</div>}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:12 }}>
          {unpinned.map(ws => <WorkspaceCard key={ws.id} ws={ws} onOpen={openWorkspace} onTogglePin={id => setWorkspaces(p => p.map(w => w.id===id?{...w,pinned:!w.pinned}:w))} />)}
        </div>
      </div>

      {/* New workspace modal */}
      {showNew && (
        <>
          <div onClick={() => setShowNew(false)} style={{ position:'fixed', inset:0, background:'rgba(8,14,26,0.4)', zIndex:1000, backdropFilter:'blur(2px)' }} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:1001, width:480, maxWidth:'calc(100vw - 32px)', background: '#fff', borderRadius:16, boxShadow:'0 16px 64px rgba(0,0,0,0.15)', overflow:'hidden' }}>
            <div style={{ padding:'16px 20px', background:'linear-gradient(135deg,#080E1A,#0A1220)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontWeight:800, fontSize:15, color: '#fff' }}>New Workspace</span>
              <button onClick={() => setShowNew(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', fontSize:20, cursor:'pointer' }}>×</button>
            </div>
            <div style={{ padding:24 }}>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>Name</label>
                <input value={newForm.name} onChange={e => setNewForm(f=>({...f,name:e.target.value}))} placeholder="e.g. NVDA Deep Dive"
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>Description</label>
                <input value={newForm.description} onChange={e => setNewForm(f=>({...f,description:e.target.value}))} placeholder="What will you research here?"
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>Tags (comma-separated)</label>
                <input value={newForm.tags} onChange={e => setNewForm(f=>({...f,tags:e.target.value}))} placeholder="e.g. semiconductors, AI, buy-side"
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => setShowNew(false)} style={{ flex:1, padding:10, borderRadius:10, border:'1.5px solid var(--border)', background: '#fff', color:'var(--text-secondary)', fontWeight:600, fontSize:13, cursor:'pointer' }}>Cancel</button>
                <button onClick={createWorkspace} style={{ flex:2, padding:10, borderRadius:10, border:'none', background:'var(--gradient-brand)', color: '#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>Create & Open</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )

  // ── CHAT VIEW ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 56px)', background:'#F8FAFD' }}>
      {/* Top bar */}
      <div style={{ padding:'12px 20px', background: '#fff', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => setView('list')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', fontSize:18, padding:'2px 6px', borderRadius:6, lineHeight:1 }}>←</button>
        <div style={{ width:32, height:32, borderRadius:8, background:active?.color || 'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', color: '#fff', fontWeight:900, fontSize:12 }}>
          {active?.name.slice(0,1)}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:800, fontSize:14, color:'#0A1628' }}>{active?.name}</div>
          <div style={{ fontSize:11, color:'#7D8FA9', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{active?.description}</div>
        </div>
        {/* Symbol context */}
        <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="Symbol context (optional)"
          style={{ width:160, padding:'6px 10px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:12, fontFamily:'inherit', outline:'none', textTransform:'uppercase' }} />
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ display:'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap:10, alignItems:'flex-start' }}>
            {msg.role === 'ai' && (
              <div style={{ width:30, height:30, borderRadius:8, background:'var(--gradient-brand)', display:'flex', alignItems:'center', justifyContent:'center', color: '#fff', fontWeight:900, fontSize:11, flexShrink:0, marginTop:2 }}>F</div>
            )}
            <div style={{
              maxWidth:'72%', padding:'12px 16px', borderRadius: msg.role==='user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
              background:  msg.role === 'user' ? 'var(--gradient-brand)' : '#fff',
              color:       msg.role === 'user' ? '#fff' : '#1C2B4A',
              boxShadow:   '0 2px 8px rgba(0,0,0,0.06)',
              border:      msg.role === 'ai' ? '1px solid #E2E8F2' : 'none',
              fontSize:    13, lineHeight:1.65,
            }}>
              {msg.role === 'ai' ? <AIMessage content={msg.content} /> : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>}
              {msg.sources && msg.sources.length > 0 && (
                <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid rgba(27,79,255,0.1)', display:'flex', flexWrap:'wrap', gap:4 }}>
                  {msg.sources.map((s,i) => (
                    <span key={i} style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:'rgba(27,79,255,0.08)', color:'var(--accent)', fontWeight:600 }}>{s}</span>
                  ))}
                </div>
              )}
              <div style={{ fontSize:10, marginTop:6, opacity:0.5 }}>
                {new Date(msg.timestamp).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
              </div>
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <div style={{ width:30, height:30, borderRadius:8, background:'var(--gradient-brand)', display:'flex', alignItems:'center', justifyContent:'center', color: '#fff', fontWeight:900, fontSize:11, flexShrink:0 }}>F</div>
            <div style={{ padding:'12px 16px', borderRadius:'4px 16px 16px 16px', background: '#fff', border:'1px solid var(--border)', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', opacity:0.6, animation:`bounce 1s ease-in-out ${i*0.2}s infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Prompt library */}
      <div style={{ padding:'8px 24px', background: '#fff', borderTop:'1px solid rgba(255,255,255,0.04)', display:'flex', gap:6, overflowX:'auto' }}>
        {PROMPT_LIBRARY.map((p, i) => (
          <button key={i} onClick={() => applyPrompt(p.prompt)}
            style={{ padding:'4px 12px', borderRadius:20, border:'1px solid #E2E8F2', background:'#F8FAFD', color:'#4A5568', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding:'12px 24px 16px', background: '#fff', borderTop:'1px solid var(--border)' }}>
        <div style={{ display:'flex', gap:10, alignItems:'flex-end', background:'rgba(255,255,255,0.025)', borderRadius:14, border:'1.5px solid var(--border)', padding:'8px 10px 8px 14px' }}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Ask Finsyt Intelligence anything… (Enter to send, Shift+Enter for newline)"
            rows={2}
            style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:13, fontFamily:'inherit', lineHeight:1.5, resize:'none', color:'#1C2B4A' }} />
          <button onClick={sendMessage} disabled={!input.trim() || sending}
            style={{ width:36, height:36, borderRadius:10, border:'none', background: input.trim() && !sending ? 'var(--gradient-brand)' : 'rgba(255,255,255,0.10)', color: input.trim() && !sending ? '#fff' : 'var(--text-muted)', cursor: input.trim() && !sending ? 'pointer' : 'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s', fontSize:16 }}>
            →
          </button>
        </div>
      </div>

      {/* Document Matrix */}
      <DocumentMatrix workspaceId={active?.id || ''} symbol={symbol} />

      <style>{`
        @keyframes bounce { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-4px) } }
      `}</style>
    </div>
  )
}

// ── Document Matrix (Hebbia-style) ────────────────────────────────────────────
const DOC_TYPES: Record<string, { color: string; bg: string }> = {
  '10-K':        { color: 'var(--accent)', bg: 'var(--accent-dim)' },
  '10-Q':        { color: '#0D9FE8', bg: '#E8F6FD' },
  'Earnings Call': { color: 'var(--pos)', bg: 'var(--pos-dim)' },
  'Research':    { color: '#7C3AED', bg: '#F5F0FF' },
  'News':        { color: 'var(--amber)', bg: 'var(--amber-dim)' },
  '8-K':         { color: 'var(--neg)', bg: 'var(--neg-dim)' },
}

const DEMO_DOCS = [
  { id: 'd1', name: 'Annual Report FY2024', date: '2025-02-14', type: '10-K',        risks: 'Competition from hyperscalers; export controls limiting China sales; supply chain concentration with TSMC', considerations: 'Data center TAM expanding faster than consensus; strong pricing power in H100/H200 family', sentiment: 'Bullish' },
  { id: 'd2', name: 'Q3 2024 Earnings Call', date: '2024-11-20', type: 'Earnings Call', risks: 'Gross margin compression in Q4; capacity constraints limiting near-term upside', considerations: 'Management raised guidance above consensus; Blackwell architecture on track for mass production', sentiment: 'Bullish' },
  { id: 'd3', name: 'Q2 2024 10-Q Filing', date: '2024-08-28', type: '10-Q',         risks: 'Customer concentration: top 5 customers represent 40%+ of revenue; Inference compute shift may commoditise training chips', considerations: 'Gross margins expanded to 78.4%; software/ecosystem moat via CUDA', sentiment: 'Neutral' },
  { id: 'd4', name: 'Goldman Sachs Initiation', date: '2024-10-10', type: 'Research', risks: 'Valuation stretched at 35x forward earnings; potential for multiple compression', considerations: 'AI capex cycle still in early innings; $6T addressable market by 2030', sentiment: 'Bullish' },
  { id: 'd5', name: 'Bloomberg: Antitrust Probe', date: '2024-09-05', type: 'News',   risks: 'DOJ investigating CUDA ecosystem lock-in; potential for open-source alternatives gaining traction', considerations: 'Regulatory overhang unlikely to materialise into structural remedies near-term', sentiment: 'Bearish' },
]

const AI_COLUMNS = ['Investment Risks', 'Market Considerations', 'Sentiment']

type MatrixCell = { value: string; loading: boolean }

function DocumentMatrix({ workspaceId, symbol }: { workspaceId: string; symbol: string }) {
  const [open,      setOpen]      = useState(true)
  const [docs,      setDocs]      = useState(DEMO_DOCS)
  const [columns,   setColumns]   = useState(AI_COLUMNS)
  const [cells,     setCells]     = useState<Record<string, MatrixCell>>({})
  const [addingCol, setAddingCol] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [runningRow, setRunningRow] = useState<string | null>(null)

  function getCellKey(docId: string, col: string) { return `${docId}::${col}` }

  function getCellValue(docId: string, col: string) {
    const key = getCellKey(docId, col)
    if (cells[key]) return cells[key]
    const doc = docs.find(d => d.id === docId)
    if (!doc) return null
    if (col === 'Investment Risks')       return { value: doc.risks,          loading: false }
    if (col === 'Market Considerations')  return { value: doc.considerations, loading: false }
    if (col === 'Sentiment')              return { value: doc.sentiment,       loading: false }
    return null
  }

  async function analyseRow(doc: typeof DEMO_DOCS[0]) {
    setRunningRow(doc.id)
    const customCols = columns.filter(c => !AI_COLUMNS.includes(c))
    for (const col of customCols) {
      const key = getCellKey(doc.id, col)
      setCells(prev => ({ ...prev, [key]: { value: '', loading: true } }))
      try {
        const res = await fetch(`${BASE}/api/ai-research`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `For the document "${doc.name}" (${doc.type}, ${doc.date}), answer the following in 1-2 sentences: ${col}. Focus on ${symbol || 'the company'}.`,
            symbol: symbol || undefined,
            contextLevel: 'brief',
          }),
        })
        const data = await res.json()
        setCells(prev => ({ ...prev, [key]: { value: data.answer || data.content || 'Analysis unavailable.', loading: false } }))
      } catch {
        setCells(prev => ({ ...prev, [key]: { value: '—', loading: false } }))
      }
    }
    setRunningRow(null)
  }

  function addColumn() {
    if (!newColName.trim()) return
    setColumns(prev => [...prev, newColName.trim()])
    setNewColName('')
    setAddingCol(false)
  }

  const dt = DOC_TYPES

  return (
    <div style={{ background: '#fff', borderTop: '2px solid rgba(255,255,255,0.10)', flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Document Matrix</span>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(27,79,255,0.12)', color: 'var(--accent)', fontWeight: 700 }}>{docs.length} docs</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#9BAFC8', fontWeight: 600 }}>AI-extracted insights</span>
        <span style={{ fontSize: 14, color: '#9BAFC8', marginLeft: 4 }}>{open ? '▼' : '▲'}</span>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid #F0F4FA' }}>
          {/* Toolbar */}
          <div style={{ padding: '8px 24px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <button style={{ padding: '5px 12px', borderRadius: 8, border: '1.5px dashed var(--text-muted)', background: 'rgba(255,255,255,0.025)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              + Add documents
            </button>
            {addingCol ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input value={newColName} onChange={e => setNewColName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addColumn()}
                  placeholder="Column name (e.g. Management Quality)"
                  style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid var(--accent)', fontSize: 11, fontFamily: 'inherit', outline: 'none', width: 220 }} autoFocus />
                <button onClick={addColumn} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Add</button>
                <button onClick={() => setAddingCol(false)} style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAddingCol(true)} style={{ padding: '5px 12px', borderRadius: 8, border: '1.5px dashed var(--text-muted)', background: 'rgba(255,255,255,0.025)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                + Add column
              </button>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: '#B0BCD0' }}>Click "Run" on any row to extract custom columns with AI</span>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto', maxHeight: 340 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8FAFD', borderBottom: '2px solid #E2E8F2' }}>
                  <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 700, color: '#7D8FA9', fontSize: 11, whiteSpace: 'nowrap', minWidth: 200, position: 'sticky', left: 0, background: '#F8FAFD', zIndex: 1 }}>Document</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#7D8FA9', fontSize: 11, whiteSpace: 'nowrap', minWidth: 90 }}>Date</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#7D8FA9', fontSize: 11, whiteSpace: 'nowrap', minWidth: 110 }}>Type</th>
                  {columns.map(col => (
                    <th key={col} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#7D8FA9', fontSize: 11, whiteSpace: 'nowrap', minWidth: 220 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                        {col}
                      </span>
                    </th>
                  ))}
                  <th style={{ padding: '9px 12px', minWidth: 70 }} />
                </tr>
              </thead>
              <tbody>
                {docs.map((doc, idx) => {
                  const typeStyle = dt[doc.type] || { color: '#4A5568', bg: '#F0F4FA' }
                  const isRunning = runningRow === doc.id
                  return (
                    <tr key={doc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isRunning ? 'var(--accent-dim)' : idx % 2 === 0 ? '#fff' : 'var(--bg-page)', transition: 'background 0.15s' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220, position: 'sticky', left: 0, background: isRunning ? 'var(--accent-dim)' : idx % 2 === 0 ? '#fff' : 'var(--bg-page)', zIndex: 1 }}>
                        {doc.name}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#7D8FA9', whiteSpace: 'nowrap' }}>{doc.date}</td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: typeStyle.color, background: typeStyle.bg }}>
                          {doc.type}
                        </span>
                      </td>
                      {columns.map(col => {
                        const cell = getCellValue(doc.id, col)
                        return (
                          <td key={col} style={{ padding: '10px 12px', maxWidth: 260, verticalAlign: 'top' }}>
                            {!cell ? (
                              <span style={{ color: '#C0CEDF', fontSize: 11 }}>—</span>
                            ) : cell.loading ? (
                              <div style={{ display: 'flex', gap: 3, alignItems: 'center', padding: '4px 0' }}>
                                {[0,1,2].map(i => (
                                  <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', animation: `bounce 1s ease-in-out ${i*0.2}s infinite` }} />
                                ))}
                              </div>
                            ) : col === 'Sentiment' ? (
                              <span style={{
                                padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                color:      cell.value === 'Bullish' ? 'var(--pos)' : cell.value === 'Bearish' ? 'var(--neg)' : 'var(--amber)',
                                background: cell.value === 'Bullish' ? 'var(--pos-dim)' : cell.value === 'Bearish' ? 'var(--neg-dim)' : 'var(--amber-dim)',
                              }}>
                                {cell.value}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: '#3D4F6E', lineHeight: 1.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', display: '-webkit-box' as any }}>
                                {cell.value}
                              </span>
                            )}
                          </td>
                        )
                      })}
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        {columns.some(c => !AI_COLUMNS.includes(c)) && (
                          <button onClick={() => analyseRow(doc)} disabled={isRunning}
                            style={{ padding: '4px 10px', borderRadius: 7, border: 'none', background: isRunning ? 'rgba(255,255,255,0.10)' : 'var(--gradient-brand)', color: isRunning ? 'var(--text-muted)' : '#fff', fontSize: 11, fontWeight: 700, cursor: isRunning ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                            {isRunning ? '…' : 'Run'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Workspace card ─────────────────────────────────────────────────────────────
function WorkspaceCard({ ws, onOpen, onTogglePin }: { ws: Workspace; onOpen: (ws: Workspace) => void; onTogglePin: (id: string) => void }) {
  return (
    <div className="card" style={{ padding:'16px 18px', cursor:'pointer', transition:'all 0.15s' }}
      onClick={() => onOpen(ws)}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:10 }}>
        <div style={{ width:36, height:36, borderRadius:10, background:ws.color, display:'flex', alignItems:'center', justifyContent:'center', color: '#fff', fontWeight:900, fontSize:14, flexShrink:0 }}>
          {ws.name.slice(0,1)}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:800, fontSize:14, color:'#0A1628', marginBottom:2 }}>{ws.name}</div>
          <div style={{ fontSize:12, color:'#7D8FA9', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ws.description}</div>
        </div>
        <button onClick={e => { e.stopPropagation(); onTogglePin(ws.id) }}
          style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, color: ws.pinned ? 'var(--accent)' : 'rgba(255,255,255,0.10)', padding:2 }}
          title={ws.pinned ? 'Unpin' : 'Pin'}>
          📌
        </button>
      </div>
      {ws.lastMessage && (
        <div style={{ fontSize:12, color:'#4A5568', background:'#F8FAFD', borderRadius:8, padding:'8px 10px', marginBottom:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          "{ws.lastMessage}"
        </div>
      )}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {ws.tags.slice(0,3).map(tag => (
            <span key={tag} style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'#F0F4FA', color:'#7D8FA9', fontWeight:600 }}>{tag}</span>
          ))}
        </div>
        <div style={{ fontSize:11, color:'#B0BCD0' }}>{ws.messageCount} msgs · {ws.updatedAt}</div>
      </div>
    </div>
  )
}

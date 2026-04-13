'use client'
import { useEffect, useState, useRef } from 'react'

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

const WORKSPACE_COLORS = ['#1B4FFF','#059669','#D97706','#7C3AED','#DC2626','#0D9FE8']

const DEMO_WORKSPACES: Workspace[] = [
  {
    id:'ws1', name:'NVDA Deep Dive', description:'Full analysis of NVIDIA — earnings thesis, valuation, AI tailwinds',
    createdAt:'2026-04-10', updatedAt:'2026-04-13', pinned:true, messageCount:14, lastMessage:'What is NVDA\'s data center revenue trajectory?',
    tags:['semiconductors','AI','buy-side'], color:'#1B4FFF',
  },
  {
    id:'ws2', name:'Q2 Earnings Preview', description:'Tracking upcoming earnings + consensus vs actual',
    createdAt:'2026-04-08', updatedAt:'2026-04-12', pinned:true, messageCount:7,  lastMessage:'Which S&P 500 companies report next week?',
    tags:['earnings','macro'], color:'#059669',
  },
  {
    id:'ws3', name:'UK Macro Monitor', description:'BOE policy, inflation data, FTSE positioning',
    createdAt:'2026-04-05', updatedAt:'2026-04-11', pinned:false, messageCount:5,  lastMessage:'What did the BOE say about rate cuts?',
    tags:['macro','UK','rates'], color:'#D97706',
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
      const res  = await fetch('/api/ai-research', {
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

  function usePrompt(p: string) {
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
          style={{ padding:'8px 16px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
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
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:1001, width:480, maxWidth:'calc(100vw - 32px)', background:'#fff', borderRadius:16, boxShadow:'0 16px 64px rgba(0,0,0,0.15)', overflow:'hidden' }}>
            <div style={{ padding:'16px 20px', background:'linear-gradient(135deg,#080E1A,#0A1220)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontWeight:800, fontSize:15, color:'#fff' }}>New Workspace</span>
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
                <button onClick={() => setShowNew(false)} style={{ flex:1, padding:10, borderRadius:10, border:'1.5px solid #E2E8F2', background:'#fff', color:'#7D8FA9', fontWeight:600, fontSize:13, cursor:'pointer' }}>Cancel</button>
                <button onClick={createWorkspace} style={{ flex:2, padding:10, borderRadius:10, border:'none', background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>Create & Open</button>
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
      <div style={{ padding:'12px 20px', background:'#fff', borderBottom:'1px solid #E2E8F2', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => setView('list')} style={{ background:'none', border:'none', cursor:'pointer', color:'#7D8FA9', fontSize:18, padding:'2px 6px', borderRadius:6, lineHeight:1 }}>←</button>
        <div style={{ width:32, height:32, borderRadius:8, background:active?.color || '#1B4FFF', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:12 }}>
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
              <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:11, flexShrink:0, marginTop:2 }}>F</div>
            )}
            <div style={{
              maxWidth:'72%', padding:'12px 16px', borderRadius: msg.role==='user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
              background:  msg.role === 'user' ? 'linear-gradient(135deg,#1B4FFF,#0D9FE8)' : '#fff',
              color:       msg.role === 'user' ? '#fff' : '#1C2B4A',
              boxShadow:   '0 2px 8px rgba(0,0,0,0.06)',
              border:      msg.role === 'ai' ? '1px solid #E2E8F2' : 'none',
              fontSize:    13, lineHeight:1.65,
              whiteSpace:  'pre-wrap',
            }}>
              {msg.content}
              {msg.sources && msg.sources.length > 0 && (
                <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid rgba(27,79,255,0.1)', display:'flex', flexWrap:'wrap', gap:4 }}>
                  {msg.sources.map((s,i) => (
                    <span key={i} style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:'rgba(27,79,255,0.08)', color:'#1B4FFF', fontWeight:600 }}>{s}</span>
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
            <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:11, flexShrink:0 }}>F</div>
            <div style={{ padding:'12px 16px', borderRadius:'4px 16px 16px 16px', background:'#fff', border:'1px solid #E2E8F2', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'#1B4FFF', opacity:0.6, animation:`bounce 1s ease-in-out ${i*0.2}s infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Prompt library */}
      <div style={{ padding:'8px 24px', background:'#fff', borderTop:'1px solid #F0F4FA', display:'flex', gap:6, overflowX:'auto' }}>
        {PROMPT_LIBRARY.map((p, i) => (
          <button key={i} onClick={() => usePrompt(p.prompt)}
            style={{ padding:'4px 12px', borderRadius:20, border:'1px solid #E2E8F2', background:'#F8FAFD', color:'#4A5568', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding:'12px 24px 16px', background:'#fff', borderTop:'1px solid #E2E8F2' }}>
        <div style={{ display:'flex', gap:10, alignItems:'flex-end', background:'#F8FAFD', borderRadius:14, border:'1.5px solid #E2E8F2', padding:'8px 10px 8px 14px' }}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Ask Finsyt Intelligence anything… (Enter to send, Shift+Enter for newline)"
            rows={2}
            style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:13, fontFamily:'inherit', lineHeight:1.5, resize:'none', color:'#1C2B4A' }} />
          <button onClick={sendMessage} disabled={!input.trim() || sending}
            style={{ width:36, height:36, borderRadius:10, border:'none', background: input.trim() && !sending ? 'linear-gradient(135deg,#1B4FFF,#0D9FE8)' : '#E2E8F2', color: input.trim() && !sending ? '#fff' : '#B0BCD0', cursor: input.trim() && !sending ? 'pointer' : 'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s', fontSize:16 }}>
            →
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bounce { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-4px) } }
      `}</style>
    </div>
  )
}

// ── Workspace card ─────────────────────────────────────────────────────────────
function WorkspaceCard({ ws, onOpen, onTogglePin }: { ws: Workspace; onOpen: (ws: Workspace) => void; onTogglePin: (id: string) => void }) {
  return (
    <div className="card" style={{ padding:'16px 18px', cursor:'pointer', transition:'all 0.15s' }}
      onClick={() => onOpen(ws)}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:10 }}>
        <div style={{ width:36, height:36, borderRadius:10, background:ws.color, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:14, flexShrink:0 }}>
          {ws.name.slice(0,1)}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:800, fontSize:14, color:'#0A1628', marginBottom:2 }}>{ws.name}</div>
          <div style={{ fontSize:12, color:'#7D8FA9', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ws.description}</div>
        </div>
        <button onClick={e => { e.stopPropagation(); onTogglePin(ws.id) }}
          style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, color: ws.pinned ? '#1B4FFF' : '#D0D8E8', padding:2 }}
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

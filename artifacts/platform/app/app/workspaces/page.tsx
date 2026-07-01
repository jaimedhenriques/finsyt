'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AIMessage from '@/components/AIMessage'
import WorkspacesInner from './_WorkspacesInner'
import { DelegateButton } from '@/components/agent-jobs/DelegateButton'

type WorkspaceKind = 'research' | 'diligence' | 'deal'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// ── Types ─────────────────────────────────────────────────────────────────────
interface RecentViewer {
  userId:    string
  name:      string
  initials:  string
  imageUrl:  string | null
  openedAt:  string
}

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
  kind:        WorkspaceKind
  /**
   * Source ids the reviewer last had checked when they were inside this
   * workspace. Hydrated from `/api/workspaces` and threaded into
   * `WorkspacesInner` so reopening a deal room restores the curated subset.
   */
  selectedSourceIds: string[]
  recentViewers: RecentViewer[]
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

interface WorkspaceDtoFromApi {
  id: string; name: string; description: string; color: string; pinned: boolean;
  tags: string[]; messageCount: number; lastMessage: string;
  createdAt: string; updatedAt: string;
  kind?: string;
  selectedSourceIds?: string[];
  recentViewers?: RecentViewer[];
}

function fromApiWorkspace(d: WorkspaceDtoFromApi): Workspace {
  const kind: WorkspaceKind = d.kind === 'diligence' ? 'diligence' : d.kind === 'deal' ? 'deal' : 'research'
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    createdAt: d.createdAt.slice(0, 10),
    updatedAt: d.updatedAt.slice(0, 10),
    pinned: d.pinned,
    messageCount: d.messageCount,
    lastMessage: d.lastMessage,
    tags: Array.isArray(d.tags) ? d.tags : [],
    color: d.color || 'var(--accent)',
    kind,
    selectedSourceIds: Array.isArray(d.selectedSourceIds) ? d.selectedSourceIds : [],
    recentViewers: Array.isArray(d.recentViewers) ? d.recentViewers : [],
  }
}

async function patchWorkspaceServer(id: string, patch: Record<string, unknown>) {
  try {
    const res = await fetch(`${BASE}/api/workspaces?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) console.warn('[workspaces] patch failed', res.status)
  } catch (e) { console.warn('[workspaces] patch error', e) }
}

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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [hydrated, setHydrated]     = useState(false)
  const [loadError, setLoadError]   = useState<string | null>(null)
  const [active, setActive]         = useState<Workspace | null>(null)
  const [messages, setMessages]     = useState<Message[]>([])
  const [input, setInput]           = useState('')
  const [sending, setSending]       = useState(false)
  const [showNew, setShowNew]       = useState(false)
  const [newForm, setNewForm]       = useState<{ name: string; description: string; tags: string; kind: WorkspaceKind; targetSymbol: string }>({ name:'', description:'', tags:'', kind:'research', targetSymbol:'' })
  const router = useRouter()
  const [searchQ, setSearchQ]       = useState('')
  const [symbol, setSymbol]         = useState('')
  const [matrices, setMatrices]     = useState<{ id: string; name: string; updatedAt: string; tags?: string[] }[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages])

  // Hydrate from server on mount; persisted in `workspaces` table, scoped
  // to the caller's organisation via RLS.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${BASE}/api/workspaces`, { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setLoadError(res.status === 401 ? 'Sign in to load workspaces' : `Failed to load workspaces (${res.status})`)
          return
        }
        const data: { workspaces?: WorkspaceDtoFromApi[] } = await res.json().catch(() => ({}))
        if (!cancelled && Array.isArray(data.workspaces)) {
          setWorkspaces(data.workspaces.map(fromApiWorkspace))
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Network error')
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Hydrate Saved Matrices alongside workspaces. Matrix docs live in their
  // own table but surface here so analysts have one persistent-research home.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${BASE}/api/matrices`, { cache: 'no-store' })
        if (!res.ok) return
        const data: { matrices?: { id: string; name: string; updatedAt: string; tags?: string[] }[] } = await res.json().catch(() => ({}))
        if (!cancelled && Array.isArray(data.matrices)) setMatrices(data.matrices)
      } catch { /* non-fatal */ }
    })()
    return () => { cancelled = true }
  }, [])

  function openWorkspace(ws: Workspace) {
    if (ws.kind === 'deal') {
      router.push(`${BASE}/app/workspaces/deal/${encodeURIComponent(ws.id)}`)
      return
    }
    setActive(ws)
    setMessages([
      {
        id:'0', role:'ai', timestamp: new Date().toISOString(),
        content: ws.messageCount > 0
          ? `Welcome back to **${ws.name}**. ${ws.description}\n\nYou have ${ws.messageCount} previous messages in this workspace. What would you like to explore?`
          : `**${ws.name}**${ws.description ? ` — ${ws.description}` : ''}\n\nThis is a fresh workspace. Ask anything to begin researching.`,
      }
    ])
    setView('chat')
  }

  async function createWorkspace() {
    if (newForm.kind === 'deal') {
      // The "target" field accepts either a public ticker or a private-company
      // UUID; we forward whichever shape we recognise so the API can resolve
      // the right downstream surfaces (peers/valuation/memo/deck).
      const raw = newForm.targetSymbol.trim()
      if (!raw) { setLoadError('A target ticker or company id is required for a deal-team workspace.'); return }
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
      const targetField = isUuid
        ? { targetCompanyId: raw }
        : { targetSymbol: raw.toUpperCase() }
      try {
        const res = await fetch(`${BASE}/api/workspaces/deal-team`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...targetField,
            name: newForm.name || undefined,
            description: newForm.description || undefined,
          }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setLoadError(d.error || `Failed to create deal workspace (${res.status})`)
          return
        }
        const d: { workspace?: { id?: string } } = await res.json().catch(() => ({}))
        if (d.workspace?.id) {
          setNewForm({ name:'', description:'', tags:'', kind:'research', targetSymbol:'' })
          setShowNew(false)
          router.push(`${BASE}/app/workspaces/deal/${encodeURIComponent(d.workspace.id)}`)
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Network error')
      }
      return
    }

    if (!newForm.name) return
    const payload = {
      name: newForm.name,
      description: newForm.description,
      tags: newForm.tags.split(',').map(t => t.trim()).filter(Boolean),
      color: WORKSPACE_COLORS[Math.floor(Math.random() * WORKSPACE_COLORS.length)],
      kind: newForm.kind,
    }
    try {
      const res = await fetch(`${BASE}/api/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        setLoadError(res.status === 401 ? 'Sign in to save workspaces' : `Failed to create workspace (${res.status})`)
        return
      }
      const data: { workspace?: WorkspaceDtoFromApi } = await res.json().catch(() => ({}))
      if (data.workspace) {
        const ws = fromApiWorkspace({ ...data.workspace, recentViewers: [] })
        setWorkspaces(prev => [ws, ...prev])
        setNewForm({ name:'', description:'', tags:'', kind:'research', targetSymbol:'' })
        setShowNew(false)
        openWorkspace(ws)
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Network error')
    }
  }

  async function deleteWorkspace(id: string) {
    setWorkspaces(prev => prev.filter(w => w.id !== id))
    try { await fetch(`${BASE}/api/workspaces?id=${encodeURIComponent(id)}`, { method: 'DELETE' }) }
    catch (e) { console.warn('[workspaces] delete error', e) }
  }

  function togglePin(id: string) {
    setWorkspaces(prev => {
      const next = prev.map(w => w.id === id ? { ...w, pinned: !w.pinned } : w)
      const updated = next.find(w => w.id === id)
      if (updated) patchWorkspaceServer(id, { pinned: updated.pinned })
      return next
    })
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
      // Update workspace last message (optimistic + server PATCH so the
      // dashboard list reflects activity).
      if (active) {
        setWorkspaces(prev => prev.map(ws =>
          ws.id === active.id ? { ...ws, lastMessage: q, messageCount: ws.messageCount + 1, updatedAt: new Date().toISOString().slice(0,10) } : ws
        ))
        const newCount = (active.messageCount || 0) + 1
        patchWorkspaceServer(active.id, { lastMessage: q.slice(0, 500), messageCount: newCount })
        setActive(prev => prev ? { ...prev, lastMessage: q, messageCount: newCount } : prev)
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
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <DelegateButton
            variant="ghost"
            label="Delegate to agent"
            context={{ surface: 'workspace', defaultDeliverable: 'analysis' }}
          />
          <button onClick={() => setShowNew(true)}
            style={{ padding:'8px 16px', borderRadius:10, border:'none', background:'var(--gradient-brand)', color: '#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
            + New Workspace
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom:20 }}>
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search workspaces by name or tag…"
          style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
      </div>

      {/* Saved Matrices */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 10 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#B0BCD0', textTransform:'uppercase', letterSpacing:'0.06em' }}>▦ Saved Matrices{matrices.length ? ` · ${matrices.length}` : ''}</div>
          <a href={`${BASE}/app/matrix`} style={{ fontSize:12, fontWeight:700, color:'var(--accent)', textDecoration:'none' }}>+ New matrix →</a>
        </div>
        {matrices.length === 0 ? (
          <div style={{ padding:'16px 18px', border:'1.5px dashed #E2E8F2', borderRadius:12, background:'#F8FAFD', fontSize:12.5, color:'#7D8FA9' }}>
            No saved matrices yet — open the <a href={`${BASE}/app/matrix`} style={{ color:'var(--accent)', fontWeight:700, textDecoration:'none' }}>Matrix</a> tool to grid out a question across multiple entities.
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:10 }}>
            {matrices.slice(0, 12).map(m => (
              <a key={m.id} href={`${BASE}/app/matrix?id=${encodeURIComponent(m.id)}`}
                style={{ display:'block', padding:'12px 14px', borderRadius:12, background:'#fff', border:'1.5px solid #E2E8F2', textDecoration:'none', color:'inherit' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ width:22, height:22, borderRadius:6, background:'var(--accent-dim)', color:'var(--accent)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900 }}>▦</span>
                  <span style={{ fontWeight:800, fontSize:13.5, color:'#0A1628', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</span>
                </div>
                <div style={{ fontSize:11, color:'#7D8FA9' }}>Updated {new Date(m.updatedAt).toLocaleDateString()}</div>
              </a>
            ))}
          </div>
        )}
      </div>

      {!hydrated ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#7D8FA9', fontSize: 13 }}>Loading workspaces…</div>
      ) : loadError ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--neg)', fontSize: 13 }}>{loadError}</div>
      ) : workspaces.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', border: '1.5px dashed #E2E8F2', borderRadius: 14, background: '#F8FAFD' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0A1628', marginBottom: 6 }}>No workspaces yet</div>
          <div style={{ fontSize: 13, color: '#7D8FA9', marginBottom: 16 }}>Create your first research workspace to start a persistent thread with the AI analyst.</div>
          <button onClick={() => setShowNew(true)} style={{ padding:'8px 16px', borderRadius:10, border:'none', background:'var(--gradient-brand)', color: '#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>+ New Workspace</button>
        </div>
      ) : (
        <>
          {/* Pinned */}
          {pinned.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#B0BCD0', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>📌 Pinned</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:12 }}>
                {pinned.map(ws => <WorkspaceCard key={ws.id} ws={ws} onOpen={openWorkspace} onTogglePin={togglePin} onDelete={deleteWorkspace} />)}
              </div>
            </div>
          )}

          {/* All */}
          <div>
            {pinned.length > 0 && <div style={{ fontSize:11, fontWeight:700, color:'#B0BCD0', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>All Workspaces</div>}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:12 }}>
              {unpinned.map(ws => <WorkspaceCard key={ws.id} ws={ws} onOpen={openWorkspace} onTogglePin={togglePin} onDelete={deleteWorkspace} />)}
            </div>
          </div>
        </>
      )}

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
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>Tags (comma-separated)</label>
                <input value={newForm.tags} onChange={e => setNewForm(f=>({...f,tags:e.target.value}))} placeholder="e.g. semiconductors, AI, buy-side"
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>Workspace type</label>
                <div role="radiogroup" aria-label="Workspace type" style={{ display:'grid', gridTemplateColumns:'1fr', gap:8 }}>
                  {([
                    { k:'research',  label:'🔬 Research',  sub:'Public filings, news, models' },
                    { k:'diligence', label:'🏛️ Diligence', sub:'CIM, data room, private docs' },
                    { k:'deal',      label:'🤝 Deal team',  sub:'Notebook + peers + valuation + memo + deck linked to one target' },
                  ] as const).map(opt => {
                    const selected = newForm.kind === opt.k
                    return (
                      <button
                        key={opt.k}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setNewForm(f => ({ ...f, kind: opt.k }))}
                        style={{
                          textAlign:'left',
                          padding:'10px 12px',
                          borderRadius:10,
                          border: selected ? '1.5px solid var(--accent)' : '1.5px solid #E2E8F2',
                          background: selected ? 'rgba(13,159,232,0.08)' : '#fff',
                          cursor:'pointer',
                          fontFamily:'inherit',
                        }}
                      >
                        <div style={{ fontSize:13, fontWeight:700, color:'#0A1628' }}>{opt.label}</div>
                        <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{opt.sub}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
              {newForm.kind === 'deal' && (
                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>Target ticker or company id <span style={{ color:'var(--neg)' }}>*</span></label>
                  <input
                    value={newForm.targetSymbol}
                    onChange={e => setNewForm(f => ({ ...f, targetSymbol: e.target.value }))}
                    placeholder="e.g. NVDA  •  or paste a private-company UUID"
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}
                  />
                  <div style={{ marginTop:6, fontSize:11, color:'#6B7280' }}>Public ticker → we seed a peer set from FMP and queue the playbooks. Private company id → we scaffold an empty peer basket you can curate manually.</div>
                </div>
              )}
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
  // Diligence workspaces open in the data-room shell instead of plain chat.
  if (active && active.kind === 'diligence') {
    const dealRooms = workspaces
      .filter(w => w.kind === 'diligence')
      .map(w => ({
        id: w.id,
        name: w.name,
        updatedAt: w.updatedAt,
        recentViewers: w.recentViewers,
      }))

    const handleSwitchWorkspace = (id: string) => {
      const next = workspaces.find(w => w.id === id)
      if (next && next.id !== active.id) setActive(next)
    }

    const handleCreateDealRoom = async (name: string): Promise<string | null> => {
      try {
        const res = await fetch(`${BASE}/api/workspaces`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description: '',
            tags: [],
            color: WORKSPACE_COLORS[Math.floor(Math.random() * WORKSPACE_COLORS.length)],
            kind: 'diligence',
          }),
        })
        if (!res.ok) {
          setLoadError(res.status === 401 ? 'Sign in to save workspaces' : `Failed to create workspace (${res.status})`)
          return null
        }
        const data: { workspace?: WorkspaceDtoFromApi } = await res.json().catch(() => ({}))
        if (!data.workspace) return null
        const ws = fromApiWorkspace(data.workspace)
        setWorkspaces(prev => [ws, ...prev])
        setActive(ws)
        return ws.id
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Network error')
        return null
      }
    }

    // Re-key on workspace id so the inner state (sources, selection, chat,
    // studio outputs) is reset cleanly when the reviewer switches deal rooms.
    // `initialSelectedSourceIds` carries the persisted curation so the
    // hydrated source rail starts pre-checked with the reviewer's last
    // selection rather than re-checking everything by default.
    return (
      <WorkspacesInner
        key={active.id}
        workspaceId={active.id}
        initialTitle={active.name}
        initialKind="diligence"
        initialSelectedSourceIds={active.selectedSourceIds}
        onBack={() => setView('list')}
        dealRooms={dealRooms}
        onSwitchWorkspace={handleSwitchWorkspace}
        onCreateDealRoom={handleCreateDealRoom}
        onSelectionPersisted={(ids) => {
          setWorkspaces(prev => prev.map(w => w.id === active.id ? { ...w, selectedSourceIds: ids } : w))
          setActive(prev => prev && prev.id === active.id ? { ...prev, selectedSourceIds: ids } : prev)
        }}
      />
    )
  }

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
        {/* Outreach drafts entry — deep-links into the email-draft assistant
            with the current workspace + (optional) symbol pre-selected. */}
        <Link
          href={`/app/workspaces/email-draft?workspace=${encodeURIComponent(active?.id || '')}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ''}`}
          style={{
            padding:'7px 12px', borderRadius:8,
            background:'linear-gradient(135deg, #1B4FFF 0%, #3F66FF 100%)',
            color:'#fff', fontSize:12, fontWeight:700, textDecoration:'none',
            display:'inline-flex', alignItems:'center', gap:6,
            boxShadow:'0 1px 2px rgba(27,79,255,0.25)',
          }}
          title="Open the email-draft assistant"
        >
          <span aria-hidden>✉</span> Outreach drafts
        </Link>
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
function WorkspaceCard({ ws, onOpen, onTogglePin, onDelete }: { ws: Workspace; onOpen: (ws: Workspace) => void; onTogglePin: (id: string) => void; onDelete?: (id: string) => void }) {
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
        {onDelete && (
          <button onClick={e => { e.stopPropagation(); if (confirm(`Delete workspace "${ws.name}"?`)) onDelete(ws.id) }}
            style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color: 'rgba(255,255,255,0.10)', padding:2 }}
            title="Delete workspace">
            ×
          </button>
        )}
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

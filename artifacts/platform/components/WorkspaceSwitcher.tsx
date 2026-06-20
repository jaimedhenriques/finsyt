'use client'
import { useEffect, useRef, useState } from 'react'

interface WorkspaceOption {
  id: string
  name: string
  kind: 'personal' | 'team'
  hint?: string
}

const KEY = 'finsyt:active-workspace'

const DEFAULT_OPTIONS: WorkspaceOption[] = [
  { id: 'personal', name: 'Personal workspace', kind: 'personal', hint: 'Your private notes & screens' },
  { id: 'finsyt-research', name: 'Finsyt Research',  kind: 'team', hint: 'Shared coverage · 6 members' },
  { id: 'global-macro',    name: 'Global Macro Desk', kind: 'team', hint: 'Shared coverage · 4 members' },
]

export default function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string>('personal')
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) setActiveId(raw)
    } catch {}
  }, [])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  function pick(id: string) {
    setActiveId(id)
    try { localStorage.setItem(KEY, id) } catch {}
    setOpen(false)
  }

  const active = DEFAULT_OPTIONS.find(o => o.id === activeId) || DEFAULT_OPTIONS[0]
  const initials = active.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button
        aria-label="Switch workspace"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          display:'flex', alignItems:'center', gap:10,
          padding:'6px 10px 6px 6px', borderRadius:8,
          background: open ? 'var(--hover)' : 'transparent',
          border:'1px solid', borderColor: open ? 'var(--border)' : 'transparent',
          cursor:'pointer', fontFamily:'inherit',
          transition:'all 0.12s',
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'var(--hover)' }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <span style={{
          width:26, height:26, borderRadius:6,
          background:'var(--gradient-brand)',
          display:'flex', alignItems:'center', justifyContent:'center',
          color:'#fff', fontSize:11, fontWeight:800,
        }}>{initials}</span>
        <span style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', minWidth:0 }}>
          <span style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)', lineHeight:1.1, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{active.name}</span>
          <span style={{ fontSize:10, color:'var(--text-muted)', lineHeight:1.1, marginTop:2 }}>{active.kind === 'team' ? 'Team' : 'Personal'}</span>
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color:'var(--text-muted)', flexShrink:0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div role="menu" style={{
          position:'absolute', top:'calc(100% + 8px)', left:0,
          width:280, background:'var(--bg-card)',
          border:'1px solid var(--border)', borderRadius:12,
          boxShadow:'0 16px 48px rgba(0,0,0,0.25)',
          zIndex:1000, overflow:'hidden',
        }}>
          <div style={{
            padding:'10px 14px', borderBottom:'1px solid var(--border)',
            fontSize:11, fontWeight:700, letterSpacing:'0.06em',
            color:'var(--text-muted)', textTransform:'uppercase',
          }}>Switch workspace</div>
          {DEFAULT_OPTIONS.map(o => {
            const init = o.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
            const isActive = o.id === activeId
            return (
              <button key={o.id} onClick={() => pick(o.id)} style={{
                width:'100%', display:'flex', alignItems:'center', gap:10,
                padding:'10px 14px', border:'none',
                background: isActive ? 'var(--accent-dim)' : 'transparent',
                cursor:'pointer', fontFamily:'inherit', textAlign:'left',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--hover)' }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <span style={{
                  width:28, height:28, borderRadius:7,
                  background: o.kind === 'personal' ? 'var(--bg-elevated)' : 'var(--gradient-brand)',
                  border: o.kind === 'personal' ? '1px solid var(--border)' : 'none',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color: o.kind === 'personal' ? 'var(--text-secondary)' : '#fff',
                  fontSize:11, fontWeight:800, flexShrink:0,
                }}>{init}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12.5, fontWeight:700, color:'var(--text-primary)' }}>{o.name}</div>
                  {o.hint && <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2 }}>{o.hint}</div>}
                </div>
                {isActive && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color:'var(--accent-text)', flexShrink:0 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            )
          })}
          <div style={{ padding:'8px 6px', borderTop:'1px solid var(--border)', background:'var(--bg-elevated)' }}>
            <button onClick={() => setOpen(false)} style={{
              width:'100%', padding:'8px 10px', border:'none',
              background:'transparent', color:'var(--accent-text)',
              fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', textAlign:'left',
              borderRadius:6,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >+ Create new workspace</button>
          </div>
        </div>
      )}
    </div>
  )
}

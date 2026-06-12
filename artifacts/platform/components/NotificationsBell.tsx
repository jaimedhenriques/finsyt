'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// ── NotificationsBell ──────────────────────────────────────────────────────
// Reads the workspace agent-run feed (the same source the Inbox uses) so the
// red unread badge tracks actual finished runs. Falls back to the news feed
// if the workspace has no agents yet, so an empty workspace still feels
// alive.

interface BellRun {
  id: string
  agentId: string
  agentName: string
  category: string
  ranAt: string
  read: boolean
  headline: string
}
interface NewsItem {
  id: string
  title: string
  detail?: string
  href: string
  ts: number
  seen?: boolean
}

interface LiveHighlightNotif {
  id: string
  kind: 'first_pin' | 'end_of_call'
  symbol: string
  event: string
  callKey: string
  message: string
  ts: number
  read: boolean
  noteId: string | null
  pinCount?: number
  deliveredChannels?: ('bell' | 'email' | 'slack')[]
}

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''
const SEEN_KEY = 'finsyt:notif:seen-news'

function loadSeen(): Record<string, true> {
  try { const raw = localStorage.getItem(SEEN_KEY); return raw ? JSON.parse(raw) : {} } catch { return {} }
}
function saveSeen(s: Record<string, true>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)) } catch {}
}

function timeAgo(iso: string | number): string {
  const ms = Date.now() - (typeof iso === 'number' ? iso : new Date(iso).getTime())
  const s = Math.max(1, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60); if (m < 60) return `${m}m`
  const h = Math.round(m / 60); if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [runs, setRuns] = useState<BellRun[]>([])
  const [unreadRunCount, setUnreadRunCount] = useState(0)
  const [news, setNews] = useState<NewsItem[]>([])
  const [seenNews, setSeenNews] = useState<Record<string, true>>({})
  const [liveNotifs, setLiveNotifs] = useState<LiveHighlightNotif[]>([])
  const [unreadLiveCount, setUnreadLiveCount] = useState(0)
  const ref = useRef<HTMLDivElement | null>(null)

  // Fetch agent runs (primary source for the badge).
  async function refreshRuns() {
    try {
      const r = await fetch('/api/agents/runs?limit=8', { cache: 'no-store' })
      if (!r.ok) return
      const data = await r.json()
      setRuns(Array.isArray(data?.runs) ? data.runs : [])
      setUnreadRunCount(Number(data?.unreadCount ?? 0))
    } catch {}
  }

  // Fetch a few news items as a fallback panel section (no badge contribution).
  async function refreshNews() {
    try {
      const r = await fetch('/api/news?limit=3', { cache: 'no-store' })
      if (!r.ok) return
      const d = await r.json()
      const arr: any[] = Array.isArray(d) ? d : (d.articles || d.items || d.news || [])
      setNews(arr.slice(0, 3).map((a: any, i: number) => ({
        id: `news-${a.id || a.url || i}`,
        title: a.title || a.headline || 'News update',
        detail: (a.source || a.publisher || '') + (a.symbol ? ` · ${a.symbol}` : ''),
        href: '/app/news',
        ts: a.timestamp ? Number(a.timestamp) : Date.now() - i * 1000 * 60 * 30,
      })))
    } catch {}
  }

  // Live highlights notifications (first-pin + end-of-call rollups).
  async function refreshLive() {
    try {
      const r = await fetch(`${BASE}/api/live-highlights/notifications`, { cache: 'no-store' })
      if (!r.ok) return
      const d = await r.json()
      const list: LiveHighlightNotif[] = Array.isArray(d?.notifications) ? d.notifications : []
      setLiveNotifs(list.slice(0, 8))
      setUnreadLiveCount(Number(d?.unreadCount ?? 0))
    } catch {}
  }

  useEffect(() => { setSeenNews(loadSeen()) }, [])
  useEffect(() => {
    refreshRuns(); refreshNews(); refreshLive()
    const id = setInterval(() => { refreshRuns(); refreshLive() }, 45_000)
    return () => clearInterval(id)
  }, [])

  // Refresh on open so the panel feels live.
  useEffect(() => { if (open) { refreshRuns(); refreshLive() } }, [open])

  // Click-outside / escape to close.
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const unreadNewsCount = news.filter(n => !seenNews[n.id]).length
  const totalUnread = unreadRunCount + unreadNewsCount + unreadLiveCount

  async function markAllRead() {
    if (unreadRunCount > 0) {
      // Optimistic — clear the badge immediately, then let the server confirm.
      setUnreadRunCount(0)
      setRuns(prev => prev.map(r => ({ ...r, read: true })))
      await fetch('/api/agents/runs/mark-all-read', { method: 'POST' }).catch(() => {})
    }
    if (unreadLiveCount > 0) {
      setUnreadLiveCount(0)
      setLiveNotifs(prev => prev.map(n => ({ ...n, read: true })))
      await fetch(`${BASE}/api/live-highlights/notifications`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      }).catch(() => {})
    }
    if (unreadNewsCount > 0) {
      const next: Record<string, true> = { ...seenNews }
      news.forEach(n => { next[n.id] = true })
      setSeenNews(next); saveSeen(next)
    }
  }

  async function clickLive(n: LiveHighlightNotif) {
    if (!n.read) {
      setLiveNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
      setUnreadLiveCount(c => Math.max(0, c - 1))
      fetch(`${BASE}/api/live-highlights/notifications`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [n.id] }),
      }).catch(() => {})
    }
    setOpen(false)
  }

  async function clickRun(run: BellRun) {
    if (!run.read) {
      setRuns(prev => prev.map(r => r.id === run.id ? { ...r, read: true } : r))
      setUnreadRunCount(c => Math.max(0, c - 1))
      fetch(`/api/agents/runs/${run.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      }).catch(() => {})
    }
    setOpen(false)
  }
  function clickNews(n: NewsItem) {
    const next = { ...seenNews, [n.id]: true as const }
    setSeenNews(next); saveSeen(next)
    setOpen(false)
  }

  const hasRuns = runs.length > 0

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          position:'relative',
          width:36, height:36, borderRadius:8,
          background: open ? 'var(--hover)' : 'transparent',
          border:'1px solid', borderColor: open ? 'var(--border)' : 'transparent',
          display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer', color:'var(--text-secondary)',
          transition:'all 0.12s',
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'var(--hover)' }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
        {totalUnread > 0 && (
          <span style={{
            position:'absolute', top:4, right:4,
            minWidth:16, height:16, padding:'0 4px', borderRadius:8,
            background:'var(--error, #ef4444)', color:'#fff',
            fontSize:10, fontWeight:800,
            display:'flex', alignItems:'center', justifyContent:'center',
            border:'2px solid var(--bg-card)',
          }}>{totalUnread > 9 ? '9+' : totalUnread}</span>
        )}
      </button>

      {open && (
        <div role="menu" style={{
          position:'absolute', top:'calc(100% + 8px)', right:0,
          width:360, maxHeight:'72vh', overflowY:'auto',
          background:'var(--bg-card)', border:'1px solid var(--border)',
          borderRadius:12, boxShadow:'0 16px 48px rgba(0,0,0,0.25)',
          zIndex:1000,
        }}>
          {/* Header */}
          <div style={{
            padding:'12px 14px', borderBottom:'1px solid var(--border)',
            display:'flex', alignItems:'center', justifyContent:'space-between',
          }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>Notifications</div>
            <button onClick={markAllRead} disabled={totalUnread === 0} style={{
              background:'transparent', border:'none', cursor: totalUnread ? 'pointer' : 'default',
              color: totalUnread ? 'var(--accent-text)' : 'var(--text-muted)',
              fontSize:11.5, fontWeight:600, fontFamily:'inherit',
            }}>Mark all read</button>
          </div>

          {/* Live highlights section */}
          {liveNotifs.length > 0 && (
            <div>
              <SectionLabel>Live highlights · {unreadLiveCount} unread</SectionLabel>
              {liveNotifs.map(n => {
                const unread = !n.read
                const href = '/app/settings/live-highlights'
                return (
                  <Link key={n.id} href={href} onClick={() => clickLive(n)} style={{
                    display:'block', padding:'10px 14px',
                    borderBottom:'1px solid var(--border)',
                    background: unread ? 'var(--accent-dim)' : 'transparent',
                    textDecoration:'none', color:'inherit',
                  }}>
                    <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                      <span style={{
                        width:8, height:8, borderRadius:99,
                        background: unread ? 'var(--accent)' : 'transparent',
                        marginTop:6, flexShrink:0,
                      }}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--accent-text)', marginBottom:2 }}>
                          {n.symbol} · {n.kind === 'first_pin' ? 'First pin' : 'Call ended'}
                        </div>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', lineHeight:1.4 }}>{n.message}</div>
                        {n.deliveredChannels && n.deliveredChannels.some((c) => c !== 'bell') && (
                          <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:4 }}>
                            Also sent via {n.deliveredChannels.filter((c) => c !== 'bell').join(' + ')}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize:10.5, color:'var(--text-muted)', flexShrink:0, whiteSpace:'nowrap' }}>{timeAgo(n.ts)}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          {/* Runs section */}
          {hasRuns && (
            <div>
              <SectionLabel>Agent briefs · {unreadRunCount} unread</SectionLabel>
              {runs.map(run => {
                const unread = !run.read
                return (
                  <Link key={run.id}
                    href={`/app/agents/${run.agentId}/runs/${run.id}`}
                    onClick={() => clickRun(run)} style={{
                    display:'block', padding:'10px 14px',
                    borderBottom:'1px solid var(--border)',
                    background: unread ? 'var(--accent-dim)' : 'transparent',
                    textDecoration:'none', color:'inherit',
                  }}>
                    <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                      <span style={{
                        width:8, height:8, borderRadius:99,
                        background: unread ? 'var(--accent)' : 'transparent',
                        marginTop:6, flexShrink:0,
                      }}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--accent-text)', marginBottom:2 }}>
                          {run.agentName} · {run.category}
                        </div>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', lineHeight:1.4 }}>{run.headline}</div>
                      </div>
                      <span style={{ fontSize:10.5, color:'var(--text-muted)', flexShrink:0, whiteSpace:'nowrap' }}>{timeAgo(run.ranAt)}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          {/* News section */}
          {news.length > 0 && (
            <div>
              <SectionLabel>Market</SectionLabel>
              {news.map(n => {
                const unread = !seenNews[n.id]
                return (
                  <Link key={n.id} href={n.href} onClick={() => clickNews(n)} style={{
                    display:'block', padding:'10px 14px',
                    borderBottom:'1px solid var(--border)',
                    background: unread ? 'rgba(255,255,255,0.04)' : 'transparent',
                    textDecoration:'none', color:'inherit',
                  }}>
                    <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                      <span style={{
                        width:8, height:8, borderRadius:99,
                        background: unread ? 'var(--text-secondary)' : 'transparent',
                        marginTop:6, flexShrink:0,
                      }}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', lineHeight:1.4 }}>{n.title}</div>
                        {n.detail && <div style={{ fontSize:11.5, color:'var(--text-secondary)', marginTop:2 }}>{n.detail}</div>}
                      </div>
                      <span style={{ fontSize:10.5, color:'var(--text-muted)', flexShrink:0 }}>{timeAgo(n.ts)}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          {/* Empty state */}
          {!hasRuns && news.length === 0 && liveNotifs.length === 0 && (
            <div style={{ padding:'24px 14px', textAlign:'center', color:'var(--text-muted)', fontSize:12.5 }}>
              You&apos;re all caught up.
            </div>
          )}

          <div style={{ padding:'10px 14px', textAlign:'center', borderTop: hasRuns || news.length || liveNotifs.length ? '1px solid var(--border)' : 'none' }}>
            <Link href="/app/agents/inbox" onClick={() => setOpen(false)} style={{
              fontSize:12, fontWeight:600, color:'var(--accent-text)', textDecoration:'none',
            }}>Open Inbox →</Link>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding:'9px 14px 6px', fontSize:10, fontWeight:700, color:'var(--text-muted)',
      letterSpacing:'0.08em', textTransform:'uppercase',
      borderBottom:'1px solid var(--border)', background:'rgba(255,255,255,0.02)',
    }}>{children}</div>
  )
}

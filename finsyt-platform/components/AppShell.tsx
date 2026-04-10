'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV_GROUPS = [
  { section: null, items: [
    { href: '/app', label: 'Overview', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    )},
    { href: '/app/watchlist', label: 'Watchlist', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
    )},
    { href: '/app/alerts', label: 'Alerts', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
    ), badge: '3'},
  ]},
  { section: 'Research', items: [
    { href: '/app/research', label: 'AI Research', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    )},
    { href: '/app/screener', label: 'Screener', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
    )},
    { href: '/app/news', label: 'News & Signals', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2z"/><path d="M4 2v14"/></svg>
    )},
    { href: '/app/filings', label: 'Filings', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
    )},
  ]},
  { section: 'Data', items: [
    { href: '/app/markets', label: 'Markets', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
    )},
    { href: '/app/deals', label: 'Deals & M&A', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    )},
    { href: '/app/macro', label: 'Macro', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
    )},
  ]},
]

const SIDEBAR_W = 220
const SIDEBAR_COLLAPSED_W = 60

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])

  // Persist collapse state
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') setCollapsed(true)
  }, [])
  function toggleSidebar() {
    setCollapsed(c => {
      localStorage.setItem('sidebar-collapsed', String(!c))
      return !c
    })
  }

  async function handleSearch(val: string) {
    setSearch(val)
    if (val.length < 2) { setSearchResults([]); return }
    try {
      const res = await fetch('/api/search?q=' + encodeURIComponent(val))
      const data = await res.json()
      setSearchResults(data.results || [])
    } catch {}
  }

  const sidebarW = collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_W

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* ── SIDEBAR ── */}
      <aside style={{
        width: sidebarW,
        minWidth: sidebarW,
        background: '#0D1117',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Logo + Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: collapsed ? '0 0' : '0 1rem',
          height: 60,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
          justifyContent: collapsed ? 'center' : 'space-between',
        }}>
          {!collapsed && (
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 12, flexShrink: 0 }}>F</div>
              <span style={{ fontWeight: 800, fontSize: '0.9375rem', letterSpacing: '-0.02em', color: '#fff', whiteSpace: 'nowrap' }}>Finsyt</span>
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 5, fontWeight: 700, background: 'rgba(27,79,255,0.25)', color: '#93B4FF', whiteSpace: 'nowrap' }}>Beta</span>
            </Link>
          )}
          {collapsed && (
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 12 }}>F</div>
          )}
          {!collapsed && (
            <button onClick={toggleSidebar} title="Collapse sidebar" style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, borderRadius: 6,
              transition: 'color 0.14s',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
            >
              {/* Panel-left icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 3v18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: collapsed ? '0.75rem 0' : '0.75rem 0.625rem' }}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} style={{ marginBottom: collapsed ? 0 : '0.25rem' }}>
              {group.section && !collapsed && (
                <div style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', padding: '0.625rem 0.75rem 0.3rem', marginTop: '0.5rem' }}>
                  {group.section}
                </div>
              )}
              {group.section && collapsed && <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0.5rem 10px' }} />}
              {group.items.map((item: any) => {
                const active = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href))
                return (
                  <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.625rem',
                      padding: collapsed ? '0.5rem 0' : '0.45rem 0.75rem',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      borderRadius: collapsed ? 0 : 8,
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      color: active ? '#93B4FF' : 'rgba(255,255,255,0.45)',
                      background: active ? (collapsed ? 'rgba(27,79,255,0.15)' : 'rgba(27,79,255,0.15)') : 'transparent',
                      textDecoration: 'none',
                      transition: 'all 0.12s',
                      marginBottom: 2,
                      position: 'relative',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)' } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' } }}
                  >
                    {/* Active indicator */}
                    {active && !collapsed && (
                      <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: '60%', background: '#1B4FFF', borderRadius: '0 2px 2px 0' }} />
                    )}
                    <span style={{ flexShrink: 0, display: 'flex', color: active ? '#93B4FF' : 'rgba(255,255,255,0.5)' }}>{item.icon}</span>
                    {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                    {!collapsed && item.badge && (
                      <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: '#1B4FFF', color: '#fff' }}>{item.badge}</span>
                    )}
                    {collapsed && item.badge && (
                      <span style={{ position: 'absolute', top: 6, right: 8, width: 6, height: 6, borderRadius: '50%', background: '#1B4FFF' }} />
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Bottom: expand toggle (when collapsed) + settings */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: collapsed ? '0.75rem 0' : '0.75rem 0.625rem', flexShrink: 0 }}>
          {collapsed && (
            <button onClick={toggleSidebar} title="Expand sidebar" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%', padding: '0.5rem 0', marginBottom: 8,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.35)', borderRadius: 6, transition: 'color 0.14s',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 3v18"/>
              </svg>
            </button>
          )}
          <Link href="/app/settings" title={collapsed ? 'Settings' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.625rem',
              padding: collapsed ? '0.5rem 0' : '0.45rem 0.75rem',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: collapsed ? 0 : 8,
              fontSize: '0.8125rem', fontWeight: 500,
              color: pathname === '/app/settings' ? '#93B4FF' : 'rgba(255,255,255,0.4)',
              textDecoration: 'none', transition: 'all 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
            onMouseLeave={e => { e.currentTarget.style.color = pathname === '/app/settings' ? '#93B4FF' : 'rgba(255,255,255,0.4)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            {!collapsed && <span>Settings</span>}
          </Link>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <div style={{ marginLeft: sidebarW, flex: 1, minHeight: '100vh', transition: 'margin-left 0.22s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <div style={{
          height: 60, background: '#fff', borderBottom: '1px solid #E8EDF4',
          display: 'flex', alignItems: 'center', padding: '0 1.5rem',
          position: 'sticky', top: 0, zIndex: 30, gap: '1rem',
        }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
            <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#B0BCD0', pointerEvents: 'none' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input className="input" placeholder="Search ticker, company, filing..." value={search}
              onChange={e => handleSearch(e.target.value)}
              onBlur={() => setTimeout(() => setSearchResults([]), 200)}
              style={{ background: '#F7F9FC', border: '1.5px solid #E8EDF4', height: 36, paddingLeft: '2rem', fontSize: 13, borderRadius: 8 }} />
            {searchResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', marginTop: 4, left: 0, right: 0, background: '#fff', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.12)', border: '1.5px solid #E8EDF4', zIndex: 50, overflow: 'hidden' }}>
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => { router.push('/app/company/' + r.symbol); setSearch(''); setSearchResults([]) }}
                    style={{ width: '100%', textAlign: 'left', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i < searchResults.length - 1 ? '1px solid #F0F4FA' : 'none', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: '#1B4FFF', width: 56, flexShrink: 0 }}>{r.symbol}</span>
                    <span style={{ fontSize: 13, color: '#1C2B4A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#B0BCD0', flexShrink: 0 }}>{r.region}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: '#6B7A8F' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
              Live
            </span>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, marginLeft: 6, cursor: 'pointer' }}>J</div>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

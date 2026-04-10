'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useLocale } from '@/lib/i18n/LocaleContext'
import { t, LOCALES } from '@/lib/i18n/translations'

const SIDEBAR_W = 220
const SIDEBAR_COLLAPSED_W = 60

function NavIcon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const NAV_ICONS: Record<string, React.ReactNode> = {
  overview: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  watchlist: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
  alerts: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  ai_research: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  screener: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>,
  news_signals: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2z"/><path d="M4 2v14"/></svg>,
  filings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  markets: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  deals: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  macro: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
}

function NavItem({ href, labelKey, iconKey, badge, collapsed, active }: {
  href: string; labelKey: string; iconKey: string; badge?: string; collapsed: boolean; active: boolean
}) {
  const { locale } = useLocale()
  const label = t(locale, labelKey)
  return (
    <Link href={href} title={collapsed ? label : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.625rem',
        padding: collapsed ? '0.5rem 0' : '0.45rem 0.75rem',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: collapsed ? 0 : 8, fontSize: '0.8125rem', fontWeight: 500,
        color: active ? '#93B4FF' : 'rgba(255,255,255,0.45)',
        background: active ? 'rgba(27,79,255,0.15)' : 'transparent',
        textDecoration: 'none', transition: 'all 0.12s', marginBottom: 2,
        position: 'relative', whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.8)' } }}
      onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.45)' } }}
    >
      {active && !collapsed && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: '60%', background: '#1B4FFF', borderRadius: '0 2px 2px 0' }} />}
      <span style={{ flexShrink: 0, display: 'flex', color: active ? '#93B4FF' : 'rgba(255,255,255,0.5)' }}>{NAV_ICONS[iconKey]}</span>
      {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
      {!collapsed && badge && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: '#1B4FFF', color: '#fff' }}>{badge}</span>}
      {collapsed && badge && <span style={{ position: 'absolute', top: 6, right: 8, width: 6, height: 6, borderRadius: '50%', background: '#1B4FFF' }} />}
    </Link>
  )
}

// ── Language picker ──────────────────────────────────────────────────────────
function LangPicker() {
  const { locale, setLocale } = useLocale()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = LOCALES.find(l => l.code === locale)!
  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
        background: '#F7F9FC', border: '1.5px solid #E8EDF4', borderRadius: 8,
        cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#3D4F6E', fontFamily: 'inherit',
        transition: 'all 0.12s',
      }}>
        <span style={{ fontSize: 14 }}>{current.flag}</span>
        <span>{current.code.toUpperCase()}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff',
          border: '1.5px solid #E8EDF4', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
          zIndex: 100, minWidth: 160, overflow: 'hidden',
        }}>
          {LOCALES.map(l => (
            <button key={l.code} onClick={() => { setLocale(l.code); setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '8px 14px', background: l.code === locale ? '#F0F4FF' : 'none',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
              color: l.code === locale ? '#1B4FFF' : '#1C2B4A', fontWeight: l.code === locale ? 700 : 400,
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => { if (l.code !== locale) (e.currentTarget as HTMLButtonElement).style.background = '#F7F9FC' }}
              onMouseLeave={e => { if (l.code !== locale) (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
            >
              <span style={{ fontSize: 16 }}>{l.flag}</span>
              <span>{l.label}</span>
              {l.code === locale && <svg style={{ marginLeft: 'auto' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1B4FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── App Shell ────────────────────────────────────────────────────────────────
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { locale } = useLocale()
  const tr = (key: string) => t(locale, key)

  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') setCollapsed(true)
  }, [])

  function toggleSidebar() {
    setCollapsed(c => { localStorage.setItem('sidebar-collapsed', String(!c)); return !c })
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

  const NAV_GROUPS = [
    { sectionKey: null, items: [
      { href: '/app', labelKey: 'overview', iconKey: 'overview' },
      { href: '/app/watchlist', labelKey: 'watchlist', iconKey: 'watchlist' },
      { href: '/app/alerts', labelKey: 'alerts', iconKey: 'alerts', badge: '3' },
    ]},
    { sectionKey: 'research', items: [
      { href: '/app/research', labelKey: 'ai_research', iconKey: 'ai_research' },
      { href: '/app/screener', labelKey: 'screener', iconKey: 'screener' },
      { href: '/app/news', labelKey: 'news_signals', iconKey: 'news_signals' },
      { href: '/app/filings', labelKey: 'filings', iconKey: 'filings' },
    ]},
    { sectionKey: 'data', items: [
      { href: '/app/markets', labelKey: 'markets', iconKey: 'markets' },
      { href: '/app/deals', labelKey: 'deals', iconKey: 'deals' },
      { href: '/app/macro', labelKey: 'macro', iconKey: 'macro' },
    ]},
  ]

  const PanelIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M9 3v18"/>
    </svg>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* SIDEBAR */}
      <aside style={{
        width: sidebarW, minWidth: sidebarW, background: '#0D1117',
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Logo + Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', padding: collapsed ? '0' : '0 1rem', height: 60, borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, justifyContent: collapsed ? 'center' : 'space-between' }}>
          {!collapsed && (
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 12, flexShrink: 0 }}>F</div>
              <span style={{ fontWeight: 800, fontSize: '0.9375rem', letterSpacing: '-0.02em', color: '#fff', whiteSpace: 'nowrap' }}>Finsyt</span>
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 5, fontWeight: 700, background: 'rgba(27,79,255,0.25)', color: '#93B4FF', whiteSpace: 'nowrap' }}>Beta</span>
            </Link>
          )}
          {collapsed && <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 12 }}>F</div>}
          {!collapsed && (
            <button onClick={toggleSidebar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, borderRadius: 6 }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
            ><PanelIcon /></button>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: collapsed ? '0.75rem 0' : '0.75rem 0.625rem' }}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} style={{ marginBottom: collapsed ? 0 : '0.25rem' }}>
              {group.sectionKey && !collapsed && (
                <div style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', padding: '0.625rem 0.75rem 0.3rem', marginTop: '0.5rem' }}>
                  {tr(group.sectionKey)}
                </div>
              )}
              {group.sectionKey && collapsed && <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0.5rem 10px' }} />}
              {group.items.map(item => {
                const active = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href))
                return <NavItem key={item.href} {...item} collapsed={collapsed} active={active} />
              })}
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: collapsed ? '0.75rem 0' : '0.75rem 0.625rem', flexShrink: 0 }}>
          {collapsed && (
            <button onClick={toggleSidebar} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '0.5rem 0', marginBottom: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', borderRadius: 6 }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
            ><PanelIcon /></button>
          )}
          <NavItem href="/app/settings" labelKey="settings" iconKey="settings" collapsed={collapsed} active={pathname === '/app/settings'} />
        </div>
      </aside>

      {/* MAIN */}
      <div style={{ marginLeft: sidebarW, flex: 1, minHeight: '100vh', transition: 'margin-left 0.22s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <div style={{ height: 60, background: '#fff', borderBottom: '1px solid #E8EDF4', display: 'flex', alignItems: 'center', padding: '0 1.5rem', position: 'sticky', top: 0, zIndex: 30, gap: '1rem' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
            <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#B0BCD0', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input className="input" placeholder={tr('search_placeholder')} value={search}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            <LangPicker />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: '#6B7A8F' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
              {tr('live')}
            </div>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, marginLeft: 4, cursor: 'pointer' }}>J</div>
          </div>
        </div>

        <div style={{ flex: 1 }}>{children}</div>
      </div>
    </div>
  )
}

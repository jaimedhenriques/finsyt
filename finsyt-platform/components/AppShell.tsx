'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

// ─── Design tokens (dark platform interior) ────────────────────────────────
const D = {
  bg:       '#080E1A',     // deepest background
  sidebar:  '#0A1220',     // sidebar bg
  surface:  '#0F1929',     // card surface
  border:   'rgba(255,255,255,0.06)',
  accent:   '#1B4FFF',
  accentBg: 'rgba(27,79,255,0.12)',
  accentBorder: 'rgba(27,79,255,0.25)',
  text:     '#E2E8F0',
  textMuted: 'rgba(255,255,255,0.35)',
  textSub:  'rgba(255,255,255,0.55)',
  pos:      '#10B981',
  neg:      '#F43F5E',
  serif:    "'Georgia', 'Times New Roman', serif",
  sans:     "'Inter', system-ui, -apple-system, sans-serif",
}

// ─── Nav structure ─────────────────────────────────────────────────────────
const NAV = [
  {
    section: null,
    items: [
      { href: '/app',          label: 'Overview',       icon: '⊞',  desc: 'Market snapshot' },
      { href: '/app/watchlist',label: 'Watchlist',      icon: '◈',  desc: 'Your tracked stocks' },
      { href: '/app/alerts',   label: 'Alerts',         icon: '◉',  badge: '3', desc: 'Price & news alerts' },
    ],
  },
  {
    section: 'Research',
    items: [
      { href: '/app/research', label: 'AI Intelligence', icon: '◎',  desc: 'Ask anything, cite everything', pro: true },
      { href: '/app/screener', label: 'Screener',        icon: '▤',  desc: 'Filter equities & deals' },
      { href: '/app/news',     label: 'News & Signals',  icon: '◻',  desc: 'Live news with sentiment' },
      { href: '/app/filings',  label: 'SEC Filings',     icon: '▣',  desc: 'EDGAR search' },
    ],
  },
  {
    section: 'Markets & Data',
    items: [
      { href: '/app/markets',  label: 'Markets',         icon: '◲',  desc: 'Indices, forex, commodities' },
      { href: '/app/macro',    label: 'Macro',           icon: '◷',  desc: 'FRED macro indicators', pro: true },
      { href: '/app/deals',    label: 'Deals & M&A',     icon: '◳',  desc: 'M&A, VC, PE transactions', pro: true },
    ],
  },
]

// ─── Live mini ticker (sidebar bottom) ─────────────────────────────────────
const MINI_TICKERS = [
  { s: 'SPY', p: 510.33, c: 0.72 },
  { s: 'QQQ', p: 436.12, c: 1.14 },
  { s: 'NVDA', p: 876.4, c: 3.82 },
]

function MiniTicker() {
  const [prices, setPrices] = useState(MINI_TICKERS)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => {
      setPrices(prev => prev.map(p => {
        const delta = (Math.random() - 0.5) * 0.8
        return { ...p, p: +(p.p + delta).toFixed(2), c: +(p.c + (Math.random() - 0.5) * 0.1).toFixed(2) }
      }))
    }, 3000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ padding: '12px 12px 0', borderTop: `1px solid ${D.border}` }}>
      {prices.map(t => (
        <div key={t.s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 4px' }}>
          <span style={{ fontFamily: D.sans, fontSize: 11, fontWeight: 700, color: D.textSub, letterSpacing: '0.04em' }}>{t.s}</span>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontFamily: D.sans, fontSize: 11, color: D.text }}>{t.p.toFixed(2)}</span>
            <span style={{ fontFamily: D.sans, fontSize: 10, color: t.c >= 0 ? D.pos : D.neg, marginLeft: 6 }}>{t.c >= 0 ? '+' : ''}{t.c.toFixed(2)}%</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Global search modal ────────────────────────────────────────────────────
function SearchModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data.results?.slice(0, 8) || [])
      } catch {}
      setLoading(false)
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,14,26,0.85)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 580, background: '#0F1929', borderRadius: 16, border: `1px solid ${D.border}`, boxShadow: '0 40px 80px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${D.border}` }}>
          <span style={{ fontSize: 16, color: D.textMuted }}>⌕</span>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search company, ticker, or ISIN..." style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontFamily: D.sans, fontSize: 15, color: D.text,
            }} />
          <kbd style={{ fontFamily: D.sans, fontSize: 10, color: D.textMuted, background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '3px 6px' }}>ESC</kbd>
        </div>
        {results.length > 0 && (
          <div style={{ padding: '8px 0' }}>
            {results.map((r: any, i: number) => (
              <button key={i} onClick={() => { router.push(`/app/company/${r.code || r.symbol}`); onClose() }} style={{
                display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '10px 20px',
                background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.1s',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: D.accentBg, border: `1px solid ${D.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: D.sans, fontSize: 11, fontWeight: 800, color: '#93B4FF', flexShrink: 0 }}>{(r.code || r.symbol || '?').slice(0, 3)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: D.sans, fontSize: 13, fontWeight: 600, color: D.text }}>{r.code || r.symbol}</div>
                  <div style={{ fontFamily: D.sans, fontSize: 12, color: D.textMuted }}>{r.name}</div>
                </div>
                <span style={{ fontFamily: D.sans, fontSize: 11, color: D.textMuted }}>{r.exchange}</span>
              </button>
            ))}
          </div>
        )}
        {query.length >= 2 && results.length === 0 && !loading && (
          <div style={{ padding: '28px 20px', textAlign: 'center', fontFamily: D.sans, fontSize: 13, color: D.textMuted }}>No results for "{query}"</div>
        )}
        {loading && (
          <div style={{ padding: '28px 20px', textAlign: 'center', fontFamily: D.sans, fontSize: 13, color: D.textMuted }}>Searching...</div>
        )}
        {query.length === 0 && (
          <div style={{ padding: '12px 20px 20px' }}>
            <div style={{ fontFamily: D.sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: D.textMuted, textTransform: 'uppercase', marginBottom: 10 }}>Quick access</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['AAPL', 'NVDA', 'MSFT', 'TSLA', 'META', 'GOOGL', 'AMZN'].map(t => (
                <button key={t} onClick={() => { router.push(`/app/company/${t}`); onClose() }} style={{
                  fontFamily: D.sans, fontSize: 12, fontWeight: 700, color: '#93B4FF',
                  background: D.accentBg, border: `1px solid ${D.accentBorder}`,
                  borderRadius: 999, padding: '4px 12px', cursor: 'pointer',
                }}>{t}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main AppShell ──────────────────────────────────────────────────────────
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const SIDEBAR_W = sidebarCollapsed ? 64 : 220

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: ${D.bg}; }
        .nav-item { display: flex; align-items: center; gap: 0.625rem; padding: 0.45rem 0.75rem; border-radius: 8px; font-size: 0.8125rem; font-weight: 500; color: ${D.textMuted}; text-decoration: none; transition: all 0.12s; cursor: pointer; border: none; background: none; width: 100%; font-family: ${D.sans}; margin-bottom: 2px; white-space: nowrap; overflow: hidden; }
        .nav-item:hover { background: rgba(255,255,255,0.05); color: ${D.textSub}; }
        .nav-item.active { background: ${D.accentBg}; color: #93B4FF; border: 1px solid ${D.accentBorder}; }
        .nav-item.active:hover { background: rgba(27,79,255,0.18); }
        .nav-section { font-size: 0.625rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.18); padding: 0.5rem 0.75rem; margin-top: 0.75rem; white-space: nowrap; overflow: hidden; }
        .page-content { padding: 1.75rem; }
        .page-title { font-size: 1.25rem; font-weight: 800; color: ${D.text}; letter-spacing: -0.025em; }
        .section-title { font-size: 0.875rem; font-weight: 700; color: ${D.textSub}; margin-bottom: 0.75rem; }
        .label { font-size: 0.6875rem; font-weight: 600; color: ${D.textMuted}; text-transform: uppercase; letter-spacing: 0.08em; }
        .pos { color: ${D.pos}; font-weight: 600; }
        .neg { color: ${D.neg}; font-weight: 600; }
        .neu { color: ${D.textMuted}; }
        .card { background: ${D.surface}; border: 1px solid ${D.border}; border-radius: 12px; }
        .metric-card { background: ${D.surface}; border: 1px solid ${D.border}; border-radius: 12px; padding: 1.25rem 1.5rem; }
        .btn { display: inline-flex; align-items: center; gap: 0.4rem; font-family: ${D.sans}; font-weight: 600; font-size: 0.875rem; border: none; border-radius: 8px; cursor: pointer; padding: 0.5625rem 1.125rem; transition: all 0.14s; text-decoration: none; white-space: nowrap; }
        .btn-primary { background: ${D.accent}; color: #fff; }
        .btn-primary:hover { background: #1040E0; }
        .btn-outline { background: transparent; color: ${D.textSub}; border: 1px solid ${D.border}; }
        .btn-outline:hover { border-color: rgba(255,255,255,0.15); color: ${D.text}; }
        .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8125rem; border-radius: 7px; }
        .btn-ghost { background: transparent; color: ${D.textMuted}; }
        .btn-ghost:hover { background: rgba(255,255,255,0.04); color: ${D.text}; }
        .input { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid ${D.border}; color: ${D.text}; padding: 0.5rem 0.875rem; border-radius: 8px; font-size: 0.875rem; font-family: ${D.sans}; outline: none; transition: border-color 0.14s; }
        .input:focus { border-color: rgba(27,79,255,0.5); box-shadow: 0 0 0 3px rgba(27,79,255,0.1); }
        .input::placeholder { color: rgba(255,255,255,0.2); }
        .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
        .data-table th { background: rgba(255,255,255,0.03); color: ${D.textMuted}; font-weight: 600; font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.08em; padding: 0.625rem 1rem; text-align: left; border-bottom: 1px solid ${D.border}; white-space: nowrap; }
        .data-table th.right, .data-table td.right { text-align: right; }
        .data-table td { padding: 0.75rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.03); color: ${D.text}; }
        .data-table tr:hover td { background: rgba(255,255,255,0.025); }
        .data-table tr:last-child td { border-bottom: none; }
        .badge { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.625rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; }
        .badge-blue { background: rgba(27,79,255,0.15); color: #93B4FF; }
        .badge-green { background: rgba(16,185,129,0.15); color: #34D399; }
        .badge-red { background: rgba(244,63,94,0.15); color: #FB7185; }
        .badge-amber { background: rgba(245,158,11,0.15); color: #FCD34D; }
        .badge-gray { background: rgba(255,255,255,0.07); color: ${D.textMuted}; }
        .tab-bar { display: flex; gap: 0; border-bottom: 1px solid ${D.border}; margin-bottom: 1.5rem; }
        .tab-btn { padding: 0.625rem 1.125rem; font-size: 0.875rem; font-weight: 600; color: ${D.textMuted}; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-family: ${D.sans}; transition: all 0.14s; margin-bottom: -1px; }
        .tab-btn.active { color: #93B4FF; border-bottom-color: ${D.accent}; }
        .tab-btn:hover:not(.active) { color: ${D.text}; }
        .skeleton { background: linear-gradient(90deg, #0f1629 25%, #162040 50%, #0f1629 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: 6px; display: inline-block; }
        @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
      `}</style>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}

      <div style={{ display: 'flex', minHeight: '100vh', background: D.bg }}>

        {/* ── SIDEBAR ── */}
        <aside style={{
          width: SIDEBAR_W, background: D.sidebar,
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40,
          display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${D.border}`,
          transition: 'width 0.2s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
        }}>
          {/* Logo */}
          <div style={{ padding: '20px 12px 16px', flexShrink: 0 }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 16 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #1B4FFF, #0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 14, flexShrink: 0, fontFamily: D.serif }}>F</div>
              {!sidebarCollapsed && (
                <>
                  <span style={{ fontWeight: 800, fontSize: '0.9375rem', letterSpacing: '-0.03em', color: D.text, fontFamily: D.sans }}>Finsyt</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9, padding: '2px 7px', borderRadius: 6, fontWeight: 700, background: D.accentBg, color: '#93B4FF', border: `1px solid ${D.accentBorder}`, letterSpacing: '0.04em' }}>BETA</span>
                </>
              )}
            </Link>

            {/* Search button */}
            <button onClick={() => setSearchOpen(true)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '7px 10px',
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${D.border}`,
              borderRadius: 8, cursor: 'pointer', color: D.textMuted, fontFamily: D.sans, fontSize: 13,
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
            >
              <span style={{ fontSize: 14, flexShrink: 0 }}>⌕</span>
              {!sidebarCollapsed && (
                <>
                  <span style={{ flex: 1, textAlign: 'left', fontSize: 12 }}>Search ticker...</span>
                  <kbd style={{ fontSize: 9, background: 'rgba(255,255,255,0.08)', borderRadius: 3, padding: '1px 5px', color: D.textMuted, letterSpacing: '0.02em' }}>⌘K</kbd>
                </>
              )}
            </button>
          </div>

          {/* Nav */}
          <div style={{ flex: 1, padding: '0 8px', overflowY: 'auto', overflowX: 'hidden' }}>
            {NAV.map((group, gi) => (
              <div key={gi}>
                {group.section && !sidebarCollapsed && <div className="nav-section">{group.section}</div>}
                {group.items.map((item: any) => {
                  const active = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href))
                  return (
                    <Link key={item.href} href={item.href} className={`nav-item${active ? ' active' : ''}`} title={sidebarCollapsed ? item.label : undefined} style={{ textDecoration: 'none', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
                      <span style={{ fontSize: '0.9375rem', flexShrink: 0, opacity: active ? 1 : 0.65 }}>{item.icon}</span>
                      {!sidebarCollapsed && (
                        <>
                          <span style={{ flex: 1 }}>{item.label}</span>
                          {item.badge && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: D.accent, color: '#fff' }}>{item.badge}</span>}
                          {item.pro && !item.badge && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999, background: 'rgba(245,158,11,0.15)', color: '#FCD34D', letterSpacing: '0.04em' }}>PRO</span>}
                        </>
                      )}
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Bottom: tickers + settings */}
          <div style={{ padding: '8px', flexShrink: 0 }}>
            {!sidebarCollapsed && <MiniTicker />}
            <div style={{ height: 8 }} />
            <Link href="/app/settings" className={`nav-item${pathname === '/app/settings' ? ' active' : ''}`} style={{ textDecoration: 'none', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }} title={sidebarCollapsed ? 'Settings' : undefined}>
              <span style={{ fontSize: '0.9375rem', flexShrink: 0, opacity: 0.6 }}>⚙</span>
              {!sidebarCollapsed && <span>Settings</span>}
            </Link>
            {!sidebarCollapsed && (
              <Link href="/app/upgrade" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 10, textDecoration: 'none', margin: '8px 0 0' }}>
                <span style={{ fontSize: 13 }}>⚡</span>
                <div>
                  <div style={{ fontFamily: D.sans, fontSize: 11, fontWeight: 700, color: '#FCD34D' }}>Upgrade to Pro</div>
                  <div style={{ fontFamily: D.sans, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Unlimited AI · $29/mo</div>
                </div>
              </Link>
            )}
            {/* Collapse toggle */}
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%',
              padding: '8px', background: 'none', border: 'none', cursor: 'pointer',
              color: D.textMuted, fontSize: 13, marginTop: 6,
              borderRadius: 6, transition: 'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? '»' : '«'}
            </button>
          </div>
        </aside>

        {/* ── MAIN AREA ── */}
        <div style={{ marginLeft: SIDEBAR_W, flex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column', transition: 'margin-left 0.2s' }}>

          {/* Topbar */}
          <div style={{
            height: 60, background: 'rgba(10,18,32,0.95)', backdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${D.border}`,
            display: 'flex', alignItems: 'center', padding: '0 1.75rem',
            position: 'sticky', top: 0, zIndex: 30, gap: 12,
          }}>
            {/* Breadcrumb */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: D.sans, fontSize: 12, color: D.textMuted }}>Finsyt</span>
              <span style={{ color: D.border, fontSize: 12 }}>/</span>
              <span style={{ fontFamily: D.sans, fontSize: 12, fontWeight: 600, color: D.textSub }}>
                {NAV.flatMap(g => g.items).find(i => pathname === i.href || (i.href !== '/app' && pathname.startsWith(i.href)))?.label || 'Dashboard'}
              </span>
            </div>

            {/* Topbar actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Search shortcut */}
              <button onClick={() => setSearchOpen(true)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${D.border}`,
                borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
                fontFamily: D.sans, fontSize: 13, color: D.textMuted,
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              >
                <span style={{ fontSize: 14 }}>⌕</span>
                <span>Search</span>
                <kbd style={{ fontSize: 9, background: 'rgba(255,255,255,0.08)', borderRadius: 3, padding: '1px 5px', color: D.textMuted }}>⌘K</kbd>
              </button>

              {/* Alerts bell */}
              <Link href="/app/alerts" style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${D.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                textDecoration: 'none', position: 'relative',
              }}>
                <span style={{ fontSize: 15 }}>🔔</span>
                <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%', background: D.accent, border: `1.5px solid ${D.sidebar}` }} />
              </Link>

              {/* User avatar */}
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'linear-gradient(135deg, #1B4FFF, #0D9FE8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: D.sans, fontSize: 12, fontWeight: 800, color: '#fff',
                cursor: 'pointer',
              }}>J</div>
            </div>
          </div>

          {/* Page content */}
          <main style={{ flex: 1 }}>
            {children}
          </main>
        </div>
      </div>
    </>
  )
}

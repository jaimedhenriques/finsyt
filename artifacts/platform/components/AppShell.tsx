'use client'
import NPSWidget from '@/components/NPSWidget'
import NotificationsBell from '@/components/NotificationsBell'
import LiveHighlightsTicker from '@/components/LiveHighlightsTicker'
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useUser, useClerk } from '@clerk/nextjs'
import {
  CommandInput, CommandPalette, FloatingFinsytAgent, IconButton, Kbd,
  NAV_ICONS, ACTION_ICONS, ICON_SIZE_MD, ICON_STROKE,
  type PaletteAction, type NavIconKey,
} from '@/components/ui'
import { useAgents, relTime } from '@/lib/agents'
import { useWorkspace } from '@/lib/workspace'
import { type FinsytAskDetail, FINSYT_ASK_EVENT, dispatchAsk } from '@/components/ui/contextual-ask-bar'
import { FUNCTION_CODES, type CommandResolution } from '@/lib/function-codes'

const RECENT_KEY = 'finsyt:recent-searches'
type RecentSearch = { symbol: string; name?: string; ts: number }
function loadRecent(): RecentSearch[] {
  try { const r = localStorage.getItem(RECENT_KEY); return r ? JSON.parse(r) : [] } catch { return [] }
}
function pushRecent(s: RecentSearch) {
  try {
    const cur = loadRecent().filter(x => x.symbol !== s.symbol)
    const next = [s, ...cur].slice(0, 6)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {}
}

// ─── Sidebar nav ─────────────────────────────────────────────────────────────
// Agents leads. Workspace items (Overview/Watchlist/Portfolio/Alerts) sit
// directly under it. Every entry references a Lucide icon by key — emoji
// glyphs are gone from the chrome.
type NavItem = { href: string; label: string; iconKey: NavIconKey; badge?: string; pro?: boolean; exact?: boolean; cta?: boolean }
type NavGroup = { section: string | null; items: NavItem[] }

const NAV: NavGroup[] = [
  { section: 'Agents', items: [
    { href: '/app/agents/new',     label: '+ New Agent',  iconKey: 'agents',       cta: true },
    { href: '/app/agents',         label: 'My Agents',    iconKey: 'agents',       exact: true },
    { href: '/app/agents/library', label: 'Library',      iconKey: 'agentLibrary' },
    { href: '/app/agents/inbox',   label: 'Inbox',        iconKey: 'inbox',        badge: 'NEW' },
  ]},
  { section: 'Workspace', items: [
    { href: '/app',           label: 'Overview',  iconKey: 'overview',  exact: true },
    { href: '/app/watchlist', label: 'Watchlist', iconKey: 'watchlist' },
    { href: '/app/portfolio', label: 'Portfolio', iconKey: 'portfolio' },
    { href: '/app/alerts',    label: 'Alerts',    iconKey: 'alerts' },
  ]},
  { section: 'Research', items: [
    { href: '/app/research',           label: 'AI Research',       iconKey: 'research' },
    { href: '/app/research-library', label: 'Research Library',  iconKey: 'researchLib', badge: 'NEW' },
    { href: '/app/workflows',  label: 'Workflows',         iconKey: 'workflows',  badge: 'NEW' },
    { href: '/app/blueprint',  label: 'Blueprint',         iconKey: 'blueprint',  badge: 'NEW' },
    { href: '/app/outreach',   label: 'Outreach',          iconKey: 'outreach',   badge: 'NEW' },
    { href: '/app/matrix',     label: 'Matrix',            iconKey: 'matrix',     badge: 'NEW' },
    { href: '/app/workspaces', label: 'Workspaces',        iconKey: 'workspaces' },
    { href: '/app/jobs',       label: 'Jobs',              iconKey: 'jobs',       badge: 'NEW' },
    { href: '/app/projects',   label: 'Projects',          iconKey: 'projects',   badge: 'NEW' },
    { href: '/app/reports',    label: 'Reports',           iconKey: 'docs',       badge: 'NEW' },
    { href: '/app/peers',      label: 'Peers',             iconKey: 'peers',      badge: 'NEW' },
    { href: '/app/models',     label: 'Model Builder',     iconKey: 'models',     badge: 'NEW' },
    { href: '/app/valuations', label: 'Valuations',        iconKey: 'valuations', badge: 'NEW' },
    { href: '/app/screener',   label: 'Screener',          iconKey: 'screener' },
    { href: '/app/signals',    label: 'Signals',           iconKey: 'signals',    badge: 'NEW' },
    { href: '/app/news',       label: 'News & Signals',    iconKey: 'news' },
    { href: '/app/calendar',   label: 'Calendar',          iconKey: 'calendar',   badge: 'NEW' },
    { href: '/app/questions',  label: 'Analyst Questions', iconKey: 'questions',  pro: true },
    { href: '/app/filings',    label: 'Filings',           iconKey: 'filings' },
  ]},
  { section: 'Data', items: [
    { href: '/app/markets',   label: 'Markets',     iconKey: 'markets' },
    { href: '/app/deals',     label: 'Deals & M&A', iconKey: 'deals' },
    { href: '/app/macro',     label: 'Macro',       iconKey: 'macro' },
    { href: '/app/rates',     label: 'Rates Desk',  iconKey: 'rates', badge: 'NEW' },
    { href: '/app/cot',       label: 'Positioning', iconKey: 'signals', badge: 'NEW' },
    { href: '/app/discovery', label: 'Private Co.', iconKey: 'discovery', pro: true },
  ]},
  { section: 'Platform', items: [
    { href: '/app/connectors', label: 'Connectors',       iconKey: 'connectors', badge: 'NEW' },
    { href: '/app/excel',      label: 'Finsyt for Excel', iconKey: 'excel',      badge: 'NEW' },
    { href: '/app/developer',  label: 'API Docs',         iconKey: 'developer' },
    { href: '/app/mcp',        label: 'MCP Tools',        iconKey: 'mcp' },
    { href: '/app/docs',       label: 'Docs',             iconKey: 'docs' },
  ]},
  { section: 'Admin', items: [
    { href: '/app/admin/audit',     label: 'Audit Log',       iconKey: 'audit' },
    { href: '/app/admin/providers', label: 'Provider Health', iconKey: 'providers', badge: 'NEW' },
  ]},
]

function NavIcon({ k, size = 16 }: { k: NavIconKey; size?: number }) {
  const Icon = NAV_ICONS[k]
  return <Icon width={size} height={size} strokeWidth={ICON_STROKE} />
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const { user } = useUser()
  const { signOut } = useClerk()
  const { runs, agents } = useAgents()
  const { screenerPresets } = useWorkspace()

  const [search, setSearch]               = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchError, setSearchError]     = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen]     = useState(true)
  const [paletteOpen, setPaletteOpen]     = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [cmdHelpOpen, setCmdHelpOpen]     = useState(false)
  const gKeyRef = useRef<number>(0)
  const [menuOpen, setMenuOpen]           = useState(false)
  const [askOpen, setAskOpen]             = useState(false)
  const [askSeed, setAskSeed]             = useState<{ prompt: string; autoSubmit?: boolean; context?: Record<string, unknown> } | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([])

  useEffect(() => { setRecentSearches(loadRecent()) }, [])

  // Persist sidebar collapse state
  useEffect(() => {
    try { const v = localStorage.getItem('finsyt:sidebar'); if (v != null) setSidebarOpen(v === '1') } catch {}
  }, [])
  useEffect(() => { try { localStorage.setItem('finsyt:sidebar', sidebarOpen ? '1' : '0') } catch {} }, [sidebarOpen])

  // ── Cross-page ask channel ────────────────────────────────────────────────
  // ContextualAskBar / InlineAgentMenu / FloatingFinsytAgent all dispatch a
  // `finsyt:ask` event. The shell intercepts it, opens the drawer, and seeds
  // the prompt so the same surface answers every question regardless of where
  // it originated.
  useEffect(() => {
    function onAsk(e: Event) {
      const detail = (e as CustomEvent<FinsytAskDetail>).detail
      if (!detail || !detail.prompt) return
      setAskSeed({ prompt: detail.prompt, autoSubmit: detail.autoSubmit !== false, context: detail.context })
      setAskOpen(true)
    }
    window.addEventListener(FINSYT_ASK_EVENT, onAsk as EventListener)
    return () => window.removeEventListener(FINSYT_ASK_EVENT, onAsk as EventListener)
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const el = t as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
    }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setPaletteOpen(o => !o); return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        // Always clear the previous contextual seed when toggling via the
        // shortcut so re-opening doesn't auto-resubmit a stale prompt.
        e.preventDefault(); setAskSeed(null); setAskOpen(o => !o); return
      }
      if (isTyping(e.target)) return
      if (e.key === '?') { e.preventDefault(); setShortcutsOpen(true); return }
      // The "/" shortcut is owned by CommandInput (it focuses itself when the
      // user is not already typing in another field). We deliberately do NOT
      // bind it here so there is exactly one authoritative handler.
      if (e.key.toLowerCase() === 'g') { gKeyRef.current = Date.now(); return }
      if (Date.now() - gKeyRef.current < 1200) {
        const map: Record<string,string> = { o:'/app', w:'/app/watchlist', r:'/app/research', m:'/app/models', c:'/app/calendar', n:'/app/news', f:'/app/filings', s:'/app/screener', x:'/app/matrix', a:'/app/agents' }
        const dest = map[e.key.toLowerCase()]
        if (dest) { e.preventDefault(); router.push(dest); gKeyRef.current = 0 }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

  const userInitial =
    (user?.firstName?.[0] ||
      user?.username?.[0] ||
      user?.emailAddresses?.[0]?.emailAddress?.[0] ||
      'U').toUpperCase()
  const userLabel =
    user?.fullName ||
    user?.firstName ||
    user?.username ||
    user?.emailAddresses?.[0]?.emailAddress ||
    ''
  const userEmail = user?.emailAddresses?.[0]?.emailAddress || ''

  async function handleSearch(val: string) {
    setSearch(val)
    if (val.length < 2) { setSearchResults([]); setSearchError(null); return }
    try {
      const res  = await fetch('/api/search?q=' + encodeURIComponent(val))
      const data = await res.json()
      if (data.providerError && (!data.results || data.results.length === 0)) {
        setSearchResults([])
        setSearchError(data.errorMessage || 'Search is temporarily unavailable — a data provider failed. Please try again.')
      } else {
        setSearchResults(data.results || [])
        setSearchError(null)
      }
    } catch { setSearchError(null) }
  }

  // Current company symbol (when on a /app/company/[symbol] route) so the
  // palette can offer ticker-scoped function codes resolved against it.
  const currentSymbol = useMemo(() => {
    const m = pathname?.match(/^\/app\/company\/([^/?#]+)/)
    return m ? decodeURIComponent(m[1]).toUpperCase() : null
  }, [pathname])

  // ── Palette actions: pages, recent companies, recent agent runs ──────────
  const paletteActions: PaletteAction[] = useMemo(() => {
    const out: PaletteAction[] = []
    const runResolution = (res: CommandResolution) => {
      if (res.kind === 'route') router.push(res.route)
      else dispatchAsk({ prompt: res.prompt, autoSubmit: res.autoSubmit !== false })
    }
    // Function codes — global codes always, company codes when a ticker is in
    // context. Mirrors the topbar command line so the same vocabulary is
    // fuzzy-searchable here.
    for (const fc of FUNCTION_CODES) {
      if (fc.scope === 'global') {
        out.push({
          id: 'fn:' + fc.code,
          group: 'Function codes',
          label: `${fc.label}`,
          hint: fc.code,
          icon: <ACTION_ICONS.sparkles width={ICON_SIZE_MD} height={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />,
          keywords: `${fc.code} ${(fc.aliases || []).join(' ')} ${fc.label} ${fc.description} command function`,
          onRun: () => runResolution(fc.resolve()),
        })
      } else if (currentSymbol) {
        out.push({
          id: 'fn:' + currentSymbol + ':' + fc.code,
          group: `Function codes · ${currentSymbol}`,
          label: `${currentSymbol} · ${fc.label}`,
          hint: `${currentSymbol} ${fc.code}`,
          icon: <NAV_ICONS.company width={ICON_SIZE_MD} height={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />,
          keywords: `${currentSymbol} ${fc.code} ${(fc.aliases || []).join(' ')} ${fc.label} ${fc.description} command function`,
          onRun: () => runResolution(fc.resolve(currentSymbol)),
        })
      }
    }
    out.push({
      id: 'fn:help',
      group: 'Function codes',
      label: 'Command help — all function codes',
      hint: '?',
      icon: <ACTION_ICONS.search width={ICON_SIZE_MD} height={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />,
      keywords: 'command help function codes list cheatsheet mnemonics terminal',
      onRun: () => setCmdHelpOpen(true),
    })
    for (const g of NAV) {
      for (const it of g.items) {
        if (it.href === '/app/agents/new') continue
        const Icon = NAV_ICONS[it.iconKey]
        out.push({
          id: 'nav:' + it.href,
          group: g.section ?? 'Workspace',
          label: it.label,
          hint: it.href.replace(/^\/app/, '') || '/',
          icon: <Icon width={ICON_SIZE_MD} height={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />,
          keywords: it.label,
          onRun: () => router.push(it.href),
        })
      }
    }
    out.push({
      id: 'nav:agents-new',
      group: 'Agents',
      label: 'Create a new agent',
      hint: 'New',
      icon: <ACTION_ICONS.plus width={ICON_SIZE_MD} height={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />,
      keywords: 'agent new add create',
      onRun: () => router.push('/app/agents/new'),
    })
    for (const r of recentSearches.slice(0, 6)) {
      out.push({
        id: 'recent:' + r.symbol,
        group: 'Recent companies',
        label: `${r.symbol}${r.name ? ' · ' + r.name : ''}`,
        hint: 'Open profile',
        icon: <NAV_ICONS.company width={ICON_SIZE_MD} height={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />,
        keywords: r.symbol + ' ' + (r.name || ''),
        onRun: () => router.push('/app/company/' + r.symbol),
      })
    }
    for (const run of runs.slice(0, 6)) {
      out.push({
        id: 'run:' + run.id,
        group: 'Recent agent runs',
        label: run.headline,
        hint: `${run.agentName} · ${relTime(run.ranAt)}`,
        icon: <NAV_ICONS.agents width={ICON_SIZE_MD} height={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />,
        keywords: `${run.agentName} ${run.category} ${run.headline}`,
        onRun: () => router.push('/app/agents/inbox'),
      })
    }
    // Saved screens — surface user-saved factor combos so they can be relaunched
    // from anywhere without navigating to /app/screener first.
    for (const preset of screenerPresets.slice(0, 8)) {
      out.push({
        id: 'screen:' + preset.id,
        group: 'Saved screens',
        label: preset.name,
        hint: preset.shared ? 'Shared' : 'Mine',
        icon: <NAV_ICONS.screener width={ICON_SIZE_MD} height={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />,
        keywords: `${preset.name} screen preset filter`,
        onRun: () => router.push('/app/screener?preset=' + encodeURIComponent(preset.id)),
      })
    }
    // "Run an agent on…" — every saved agent gets a one-shot run action that
    // dispatches an ask seeded with the agent's name + the topbar query (if any).
    for (const ag of agents.slice(0, 12)) {
      out.push({
        id: 'agent-run:' + ag.id,
        group: 'Run an agent on…',
        label: `Run "${ag.name}"`,
        hint: ag.category,
        icon: <NAV_ICONS.agents width={ICON_SIZE_MD} height={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />,
        keywords: `run agent ${ag.name} ${ag.category}`,
        onRun: () => {
          dispatchAsk({
            prompt: `Run my "${ag.name}" agent now and summarise the results in plain English with citations.`,
            context: { trigger: 'palette', agentId: ag.id, agentName: ag.name, agentCategory: ag.category },
            autoSubmit: true,
          })
        },
      })
    }
    // Ticker search affordance — keeps the palette useful when the user is
    // typing a symbol they have not previously visited; routes to existing
    // search-aware company route, which falls through to /api/search.
    out.push({
      id: 'lookup:ticker',
      group: 'Search',
      label: 'Look up a ticker or company…',
      hint: 'Opens topbar search',
      icon: <ACTION_ICONS.search width={ICON_SIZE_MD} height={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />,
      keywords: 'ticker search company symbol find',
      onRun: () => {
        const el = document.querySelector<HTMLInputElement>('input[data-finsyt-topbar-search="1"]')
        el?.focus()
      },
    })
    return out
  }, [router, recentSearches, runs, screenerPresets, agents, currentSymbol])

  const SearchIcon = ACTION_ICONS.search
  const CloseIcon = ACTION_ICONS.close

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:'var(--bg-shell)',color:'var(--text-primary)',fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,sans-serif"}}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: sidebarOpen ? 232 : 56, minWidth: sidebarOpen ? 232 : 56,
        background:'var(--bg-sidebar)', borderRight:'1px solid var(--border)',
        display:'flex', flexDirection:'column',
        transition:'width 0.2s ease, min-width 0.2s ease', overflow:'hidden',
      }}>
        {/* Logo row */}
        <div style={{
          padding: sidebarOpen ? '1rem 0.875rem' : '0.75rem 0',
          display:'flex',
          flexDirection: sidebarOpen ? 'row' : 'column',
          alignItems:'center',
          gap: sidebarOpen ? 8 : 6,
          borderBottom:'1px solid var(--border)',
        }}>
          <Link href="/" style={{display:'flex',alignItems:'center',gap:8,textDecoration:'none',flexShrink:0}} title={!sidebarOpen ? 'Finsyt' : undefined}>
            <div style={{width:28,height:28,borderRadius:8,background:'var(--gradient-brand)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,color:'#fff',fontSize:12,flexShrink:0}}>F</div>
            {sidebarOpen && <span style={{fontWeight:800,fontSize:'0.9375rem',letterSpacing:'-0.02em',color:'var(--logo-text)',whiteSpace:'nowrap'}}>Finsyt</span>}
          </Link>
          {sidebarOpen && <span style={{marginLeft:'auto',fontSize:10,padding:'2px 6px',borderRadius:6,fontWeight:700,background:'var(--pill-beta-bg)',color:'var(--pill-beta-text)',whiteSpace:'nowrap'}}>Beta</span>}
          <button onClick={() => setSidebarOpen(o => !o)}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            style={{
              background:'none',border:'none',cursor:'pointer',
              color:'var(--text-muted)',padding:4,
              display:'flex',alignItems:'center',justifyContent:'center',
              borderRadius:6,flexShrink:0,
            }}>
            {sidebarOpen
              ? <ACTION_ICONS.chevronLeft width={14} height={14} strokeWidth={1.75}/>
              : <ACTION_ICONS.chevronRight width={14} height={14} strokeWidth={1.75}/>}
          </button>
        </div>

        {/* Nav */}
        <div style={{flex:1,overflowY:'auto',padding:'0.625rem 0.5rem'}}>
          {NAV.map((group, gi) => (
            <div key={gi} style={{marginBottom:'0.25rem'}}>
              {group.section && sidebarOpen && (
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-muted)',textTransform:'uppercase',padding:'0.625rem 0.5rem 0.375rem'}}>
                  {group.section}
                </div>
              )}
              {!sidebarOpen && gi > 0 && <div style={{height:1,background:'var(--border)',margin:'0.5rem 0'}}/>}
              {group.items.map((item) => {
                const active = item.exact ? pathname===item.href : pathname===item.href||pathname.startsWith(item.href+'/')
                if (item.cta) {
                  return (
                    <Link key={item.href} href={item.href} title={!sidebarOpen ? item.label : undefined}
                      style={{
                        display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,
                        textDecoration:'none',marginBottom:4,
                        background:'var(--accent)', color:'#fff',
                        boxShadow:'0 4px 12px var(--accent-dim)',
                        fontWeight:700,
                      }}>
                      <span style={{width:18,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <ACTION_ICONS.plus width={16} height={16} strokeWidth={2.25}/>
                      </span>
                      {sidebarOpen && <span style={{fontSize:13,letterSpacing:'-0.005em'}}>New Agent</span>}
                    </Link>
                  )
                }
                return (
                  <Link key={item.href} href={item.href} title={!sidebarOpen ? item.label : undefined}
                    style={{
                      display:'flex',alignItems:'center',gap:10,padding:'7px 10px',borderRadius:8,
                      textDecoration:'none',marginBottom:2,
                      background: active ? 'var(--accent-dim)' : 'transparent',
                      color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                      transition:'background 0.15s,color 0.15s',
                    }}
                    onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background='var(--hover)'; (e.currentTarget as HTMLElement).style.color='var(--text-primary)' } }}
                    onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background='transparent'; (e.currentTarget as HTMLElement).style.color='var(--text-secondary)' } }}>
                    <span style={{width:18,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <NavIcon k={item.iconKey}/>
                    </span>
                    {sidebarOpen && <>
                      <span style={{fontSize:13,fontWeight:active?600:500,whiteSpace:'nowrap'}}>{item.label}</span>
                      {item.badge && <span style={{marginLeft:'auto',fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:999,background:'var(--accent)',color:'#fff'}}>{item.badge}</span>}
                      {item.pro && <span style={{marginLeft:'auto',fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:4,background:'var(--amber-dim)',color:'var(--amber)',letterSpacing:'0.05em'}}>PRO</span>}
                    </>}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div style={{padding:'0.75rem 0.5rem',borderTop:'1px solid var(--border)'}}>
          {sidebarOpen && (
            <Link href="/app/upgrade" style={{
              display:'block',padding:'10px 12px',borderRadius:10,
              background:'var(--accent-dim)',
              border:'1px solid var(--accent-dim)',textDecoration:'none',marginBottom:8,
            }}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--accent-text)',marginBottom:2,display:'inline-flex',alignItems:'center',gap:6}}>
                <ACTION_ICONS.sparkles width={12} height={12} strokeWidth={2.25}/> Upgrade to Pro
              </div>
              <div style={{fontSize:11,color:'var(--text-secondary)'}}>Unlock unlimited queries</div>
            </Link>
          )}
          <Link href="/app/settings"
            style={{display:'flex',alignItems:'center',gap:10,padding:'7px 10px',borderRadius:8,textDecoration:'none',
              background:pathname==='/app/settings'?'var(--accent-dim)':'transparent',
              color:pathname==='/app/settings'?'var(--accent-text)':'var(--text-secondary)'}}
            title={!sidebarOpen ? 'Settings' : undefined}>
            <span style={{width:18,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <NAV_ICONS.settings width={16} height={16} strokeWidth={ICON_STROKE}/>
            </span>
            {sidebarOpen && <span style={{fontSize:13,fontWeight:500}}>Settings</span>}
          </Link>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

        {/* Topbar */}
        <div style={{
          height:56,minHeight:56,
          background:'var(--bg-topbar)',
          borderBottom:'1px solid var(--border)',
          display:'flex',alignItems:'center',
          padding:'0 1.25rem',gap:12,
          zIndex:30,
        }}>
          {/* Search */}
          <div style={{position:'relative',width:280,flexShrink:0}}>
            <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)',display:'inline-flex',alignItems:'center'}}>
              <SearchIcon width={14} height={14} strokeWidth={ICON_STROKE}/>
            </span>
            <input
              data-finsyt-topbar-search="1"
              placeholder="Search companies & filings…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              onFocus={e => {
                setSearchFocused(true);
                (e.target as HTMLInputElement).style.borderColor='var(--accent)';
                (e.target as HTMLInputElement).style.boxShadow='0 0 0 3px var(--accent-dim)'
              }}
              onBlur={(e) => {
                ;(e.target as HTMLInputElement).style.borderColor='var(--border)'
                ;(e.target as HTMLInputElement).style.boxShadow='none'
                setTimeout(() => { setSearchResults([]); setSearchFocused(false) }, 200)
              }}
              style={{
                width:'100%',background:'var(--bg-input)',border:'1.5px solid var(--border)',
                borderRadius:10,height:36,paddingLeft:32,paddingRight:46,
                fontSize:13,color:'var(--text-primary)',fontFamily:'inherit',outline:'none',
                boxSizing:'border-box',transition:'border-color 0.14s, box-shadow 0.14s',
              }}
            />
            <span style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}>
              <Kbd>⌘K</Kbd>
            </span>
            {search.length >= 2 && searchError && !searchResults.length && (
              <div style={{position:'absolute',top:'100%',marginTop:4,left:0,right:0,background:'var(--bg-card)',borderRadius:12,boxShadow:'0 8px 40px var(--hover-strong)',border:'1px solid var(--border)',zIndex:50,overflow:'hidden',width:380,padding:'14px 16px',display:'flex',alignItems:'flex-start',gap:10}}>
                <span style={{fontSize:15,lineHeight:1,flexShrink:0}}>⚠</span>
                <span style={{fontSize:12.5,color:'var(--text-secondary)',lineHeight:1.45}}>{searchError}</span>
              </div>
            )}
            {searchResults.length > 0 && (
              <div style={{position:'absolute',top:'100%',marginTop:4,left:0,right:0,background:'var(--bg-card)',borderRadius:12,boxShadow:'0 8px 40px var(--hover-strong)',border:'1px solid var(--border)',zIndex:50,overflow:'hidden',width:380}}>
                {searchResults.map((r, i) => (
                  <button key={i}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const isPrivate = r.type === 'private' || String(r.symbol).startsWith('private:')
                      if (isPrivate) {
                        const cid = r.coresignalId || String(r.symbol).replace('private:', '')
                        router.push('/app/private/' + cid)
                      } else {
                        pushRecent({ symbol:r.symbol, name:r.name, ts:Date.now() })
                        setRecentSearches(loadRecent())
                        router.push('/app/company/'+r.symbol)
                      }
                      setSearch(''); setSearchResults([]); setSearchFocused(false)
                    }}
                    style={{width:'100%',textAlign:'left',padding:'10px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:i<searchResults.length-1?'1px solid var(--border)':'none',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='var(--hover)'}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                    {(r.type === 'private' || String(r.symbol).startsWith('private:')) ? (
                      <span style={{fontWeight:700,fontSize:11,color:'var(--text-muted)',width:64,flexShrink:0,background:'var(--accent-dim)',padding:'2px 6px',borderRadius:4,display:'inline-block',textAlign:'center'}}>PRIVATE</span>
                    ) : (
                      <span style={{fontWeight:700,fontSize:13,color:'var(--accent-text)',width:64,flexShrink:0}}>{r.symbol}</span>
                    )}
                    <span style={{fontSize:13,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</span>
                    <span style={{marginLeft:'auto',fontSize:11,color:'var(--text-secondary)',background:'var(--hover)',padding:'2px 8px',borderRadius:6,flexShrink:0}}>
                      {r.type === 'private' ? (r.industry || 'Private') : r.exchange}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {searchFocused && search.length < 2 && recentSearches.length > 0 && (
              <div style={{position:'absolute',top:'100%',marginTop:4,left:0,right:0,background:'var(--bg-card)',borderRadius:12,boxShadow:'0 8px 40px var(--hover-strong)',border:'1px solid var(--border)',zIndex:50,overflow:'hidden',width:380}}>
                <div style={{padding:'8px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid var(--border)'}}>
                  <span style={{fontSize:10.5,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-muted)',textTransform:'uppercase'}}>Recent</span>
                  <button onMouseDown={(e) => { e.preventDefault(); try { localStorage.removeItem(RECENT_KEY) } catch {}; setRecentSearches([]) }}
                    style={{background:'transparent',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:11,fontWeight:600,fontFamily:'inherit'}}>Clear</button>
                </div>
                {recentSearches.map((r, i) => (
                  <button key={r.symbol} onMouseDown={(e) => { e.preventDefault(); router.push('/app/company/'+r.symbol); setSearch(''); setSearchFocused(false) }}
                    style={{width:'100%',textAlign:'left',padding:'10px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:i<recentSearches.length-1?'1px solid var(--border)':'none',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='var(--hover)'}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                    <ACTION_ICONS.history width={12} height={12} strokeWidth={ICON_STROKE} color="var(--text-muted)"/>
                    <span style={{fontWeight:700,fontSize:13,color:'var(--accent-text)',width:64,flexShrink:0}}>{r.symbol}</span>
                    {r.name && <span style={{fontSize:13,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Persistent command line — Ask Finsyt + Bloomberg-style codes */}
          <CommandInput
            placeholder="Ask Finsyt anything, or run a command — e.g. AAPL DES, NVDA FA, MACRO…"
            onShowHelp={() => setCmdHelpOpen(true)}
          />

          {/* Right actions */}
          <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:'auto'}}>
            {/* Market status pill */}
            <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:20,background:'var(--pos-dim)',border:'1px solid var(--pos-dim)'}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:'var(--pos)',boxShadow:'0 0 6px var(--pos-dim)'}}/>
              <span style={{fontSize:11,fontWeight:600,color:'var(--pos)'}}>Markets Open</span>
            </div>
            {/* Workspace switcher */}
            <WorkspaceSwitcher />
            {/* Notifications */}
            <NotificationsBell />
            {/* Live Highlights engine ticker (headless) */}
            <LiveHighlightsTicker />
            {/* Avatar + menu */}
            <div style={{position:'relative'}}>
              <button onClick={() => setMenuOpen(o => !o)} aria-label="Account menu"
                style={{width:32,height:32,borderRadius:'50%',background:'var(--gradient-brand)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',flexShrink:0,border:'none'}}>
                {user?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.imageUrl} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>
                ) : userInitial}
              </button>
              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{position:'fixed',inset:0,zIndex:40}}/>
                  <div style={{position:'absolute',right:0,top:'calc(100% + 6px)',minWidth:220,background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:10,boxShadow:'0 8px 40px var(--hover-strong)',zIndex:50,overflow:'hidden'}}>
                    {userLabel && (
                      <div style={{padding:'12px 14px',borderBottom:'1px solid var(--border)'}}>
                        <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{userLabel}</div>
                        {userEmail && userEmail !== userLabel && (
                          <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{userEmail}</div>
                        )}
                      </div>
                    )}
                    <Link href="/app/settings" onClick={() => setMenuOpen(false)}
                      style={{display:'block',padding:'10px 14px',fontSize:13,color:'var(--text-primary)',textDecoration:'none'}}>
                      Account & security
                    </Link>
                    <button
                      onClick={async () => { setMenuOpen(false); await signOut({ redirectUrl: '/platform/sign-in' }) }}
                      style={{display:'block',width:'100%',textAlign:'left',padding:'10px 14px',fontSize:13,color:'var(--neg)',background:'none',border:'none',borderTop:'1px solid var(--border)',cursor:'pointer',fontFamily:'inherit'}}>
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <NPSWidget minSessionSeconds={120} />

        {/* Page content */}
        <div style={{flex:1,overflowY:'auto',background:'var(--bg-page)',position:'relative'}}>
          {children}
        </div>
      </div>

      {/* Floating Finsyt Agent — fixed lower-right */}
      <FloatingFinsytAgent onOpen={() => { setAskSeed(null); setAskOpen(true) }} />

      {/* Command palette */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={paletteActions}
        placeholder="Search pages, companies, agent runs…"
      />

      {/* Keyboard shortcut help */}
      {shortcutsOpen && (
        <ShortcutsModal onClose={() => setShortcutsOpen(false)} />
      )}

      {/* Command (function-code) help */}
      {cmdHelpOpen && (
        <CommandHelpModal
          currentSymbol={currentSymbol}
          onClose={() => setCmdHelpOpen(false)}
          onRun={(res) => {
            setCmdHelpOpen(false)
            if (res.kind === 'route') router.push(res.route)
            else dispatchAsk({ prompt: res.prompt, autoSubmit: res.autoSubmit !== false })
          }}
        />
      )}

      {/* Ask AI drawer — always mounted so transcript + generated deck cards
          survive close/reopen without triggering regeneration. */}
      <AskAIDrawer
        open={askOpen}
        onClose={() => { setAskOpen(false); setAskSeed(null) }}
        seed={askSeed}
        recentRuns={runs.slice(0, 5)}
      />
    </div>
  )
}

// ─── Keyboard shortcut modal (unchanged behaviour, refreshed visuals) ──────
function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const rows: { keys: string[]; label: string }[] = [
    { keys: ['⌘','K'],  label: 'Open command palette' },
    { keys: ['⌘','J'],  label: 'Open Ask Finsyt' },
    { keys: ['/'],      label: 'Focus the topbar Ask input' },
    { keys: ['G','O'],  label: 'Go to Overview' },
    { keys: ['G','A'],  label: 'Go to My Agents' },
    { keys: ['G','W'],  label: 'Go to Watchlist' },
    { keys: ['G','R'],  label: 'Go to Research' },
    { keys: ['G','M'],  label: 'Go to Models' },
    { keys: ['G','S'],  label: 'Go to Screener' },
    { keys: ['G','X'],  label: 'Go to Matrix' },
    { keys: ['G','C'],  label: 'Go to Calendar' },
    { keys: ['G','N'],  label: 'Go to News' },
    { keys: ['G','F'],  label: 'Go to Filings' },
    { keys: ['?'],      label: 'Show this help' },
    { keys: ['Esc'],    label: 'Close any dialog' },
  ]
  return (
    <>
      <div onClick={onClose} aria-hidden style={{position:'fixed',inset:0,background:'rgba(8,14,26,0.45)',backdropFilter:'blur(4px)',zIndex:1300}}/>
      <div role="dialog" aria-modal="true" style={{
        position:'fixed',top:'14vh',left:'50%',transform:'translateX(-50%)',
        width:'min(520px,92vw)',maxHeight:'72vh',background:'var(--bg-card)',
        border:'1px solid var(--border)',borderRadius:14,boxShadow:'0 24px 60px rgba(0,0,0,0.32)',
        zIndex:1301,overflow:'hidden',display:'flex',flexDirection:'column',
      }}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',borderBottom:'1px solid var(--border)'}}>
          <span style={{fontWeight:800,fontSize:14,letterSpacing:'-0.005em'}}>Keyboard shortcuts</span>
          <button onClick={onClose} aria-label="Close" style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)',padding:4,borderRadius:6}}>
            <ACTION_ICONS.close width={16} height={16} strokeWidth={ICON_STROKE}/>
          </button>
        </div>
        <div style={{padding:'8px 0',overflowY:'auto'}}>
          {rows.map((r, i) => (
            <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 18px'}}>
              <span style={{fontSize:13,color:'var(--text-primary)'}}>{r.label}</span>
              <span style={{display:'inline-flex',gap:4}}>
                {r.keys.map(k => <Kbd key={k}>{k}</Kbd>)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ─── Command help modal (function-code cheatsheet) ──────────────────────────
// Lists every function code grouped by scope. Company codes resolve against
// the current ticker when one is in context (otherwise they read as
// `<TICKER> CODE` templates and are not directly runnable).
function CommandHelpModal({
  currentSymbol, onClose, onRun,
}: {
  currentSymbol: string | null
  onClose: () => void
  onRun: (res: CommandResolution) => void
}) {
  const companyCodes = FUNCTION_CODES.filter(fc => fc.scope === 'company')
  const globalCodes  = FUNCTION_CODES.filter(fc => fc.scope === 'global')
  const sym = currentSymbol || 'AAPL'
  return (
    <>
      <div onClick={onClose} aria-hidden style={{position:'fixed',inset:0,background:'rgba(8,14,26,0.45)',backdropFilter:'blur(4px)',zIndex:1300}}/>
      <div role="dialog" aria-modal="true" aria-label="Command codes" style={{
        position:'fixed',top:'12vh',left:'50%',transform:'translateX(-50%)',
        width:'min(640px,92vw)',maxHeight:'74vh',background:'var(--bg-card)',
        border:'1px solid var(--border)',borderRadius:14,boxShadow:'0 24px 60px rgba(0,0,0,0.32)',
        zIndex:1301,overflow:'hidden',display:'flex',flexDirection:'column',
      }}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',borderBottom:'1px solid var(--border)'}}>
          <div>
            <div style={{fontWeight:800,fontSize:14,letterSpacing:'-0.005em'}}>Command codes</div>
            <div style={{fontSize:11.5,color:'var(--text-secondary)',marginTop:2}}>Type <Kbd>{sym} FA</Kbd> in the command line, or <Kbd>MACRO</Kbd> for a workspace.</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)',padding:4,borderRadius:6}}>
            <ACTION_ICONS.close width={16} height={16} strokeWidth={ICON_STROKE}/>
          </button>
        </div>
        <div style={{padding:'8px 0',overflowY:'auto'}}>
          <div style={{padding:'10px 18px 4px',fontSize:10.5,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-muted)',textTransform:'uppercase'}}>
            Company codes — prefix with a ticker ({currentSymbol ? `using ${currentSymbol}` : 'e.g. AAPL'})
          </div>
          {companyCodes.map(fc => (
            <button key={fc.code}
              onClick={() => onRun(fc.resolve(sym))}
              style={{width:'100%',textAlign:'left',display:'flex',alignItems:'center',gap:12,padding:'8px 18px',background:'transparent',border:'none',cursor:'pointer',fontFamily:'inherit'}}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='var(--hover)'}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
              <span style={{minWidth:96,flexShrink:0}}><Kbd>{sym} {fc.code}</Kbd></span>
              <span style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',flexShrink:0}}>{fc.label}</span>
              <span style={{marginLeft:'auto',fontSize:12,color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{fc.description}</span>
            </button>
          ))}
          <div style={{padding:'14px 18px 4px',fontSize:10.5,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-muted)',textTransform:'uppercase'}}>
            Workspace codes — no ticker needed
          </div>
          {globalCodes.map(fc => (
            <button key={fc.code}
              onClick={() => onRun(fc.resolve())}
              style={{width:'100%',textAlign:'left',display:'flex',alignItems:'center',gap:12,padding:'8px 18px',background:'transparent',border:'none',cursor:'pointer',fontFamily:'inherit'}}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='var(--hover)'}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
              <span style={{minWidth:96,flexShrink:0}}><Kbd>{fc.code}</Kbd></span>
              <span style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',flexShrink:0}}>{fc.label}</span>
              <span style={{marginLeft:'auto',fontSize:12,color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{fc.description}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Ask AI drawer — the agentic entry point invoked by ⌘J, the topbar
   CommandInput, the FloatingFinsytAgent, the inline ContextualAskBar, and any
   InlineAgentMenu. Recent runs replace the static brochure suggestions.
   ──────────────────────────────────────────────────────────────────────── */
type ConfirmAction = {
  kind: 'create_peer_set' | 'add_member' | 'remove_member' | 'create_report'
  endpoint: string
  method: 'POST' | 'DELETE'
  body?: any
  summary: string
} | null

type DeckThumbnail = { index: number; title: string; src: string }
type DeckReady = {
  kind: 'investment_memo'
  fileId: string
  filename: string
  downloadUrl: string
  bytes: number
  expiresAt: number
  ticker: string
  companyName: string
  asOf: string
  sourceLine: string
  slideTitles: string[]
  thumbnails: DeckThumbnail[]
  sectionAvailability: Record<string, boolean>
}

interface WordReady {
  ticker:   string
  filename: string
  bytes:    number
  asOf:     string
  dataUrl:  string
}

type AgentEvent =
  | { kind: 'step'; label: string }
  | { kind: 'tool_call'; id: string; name: string; args: any }
  | { kind: 'tool_result'; id: string; name: string; ok: boolean; summary: string; raw?: string }
  | { kind: 'confirm_required'; id: string; name: string; args: any; action: ConfirmAction; status: 'pending' | 'approved' | 'rejected' | 'applied' | 'failed'; resultMessage?: string }
  | { kind: 'error'; message: string }
  | { kind: 'deck_ready'; deck: DeckReady }
  | { kind: 'word_ready'; word: WordReady }

function AskAIDrawer({
  open, onClose, seed, recentRuns,
}: {
  open: boolean
  onClose: () => void
  seed: { prompt: string; autoSubmit?: boolean; context?: Record<string, unknown> } | null
  recentRuns: ReturnType<typeof useAgents>['runs']
}) {
  const seedContextRef = useRef<Record<string, unknown> | undefined>(undefined)
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [answer, setAnswer] = useState('')
  const [activeQuestion, setActiveQuestion] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Re-focus the composer whenever the drawer is opened (not just first mount),
  // so the keyboard target is correct after every reopen.
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [events, answer])
  useEffect(() => () => { abortRef.current?.abort() }, [])

  // Seed prompt from a contextual ask / topbar / palette / inline menu.
  // Dedupe key now incorporates context — same prompt fired from a different
  // page (or with refreshed row data) should re-seed and pick up the new ctx.
  const seededRef = useRef<string | null>(null)
  useEffect(() => {
    if (!seed) {
      // No active seed → clear the captured context. The drawer is now
      // permanently mounted (so transcript survives close/reopen), which
      // means the seedContextRef would otherwise persist a stale company
      // context from a previous session and silently inject it into later
      // free-form prompts — causing wrong-ticker resolution and suppressing
      // the explicit "couldn't find a ticker" failure path.
      seedContextRef.current = undefined
      seededRef.current = null
      return
    }
    const key = seed.prompt + '|' + (seed.context ? JSON.stringify(seed.context) : '')
    if (seededRef.current === key) return
    seededRef.current = key
    seedContextRef.current = seed.context
    setPrompt(seed.prompt)
    if (seed.autoSubmit) {
      // Defer to next tick so the textarea reflects the seed before submit.
      setTimeout(() => { void runQuery(seed.prompt) }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

  const runQuery = useCallback(async function runQuery(qIn?: string) {
    const q = (qIn ?? prompt).trim()
    if (!q || running) return
    setRunning(true)
    setEvents([])
    setAnswer('')
    setActiveQuestion(q)
    setPrompt('')

    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const ctx = seedContextRef.current
      const res = await fetch('/api/agent/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ctx ? { question: q, context: ctx } : { question: q }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        setEvents(e => [...e, { kind: 'error', message: `HTTP ${res.status}` }])
        setRunning(false); return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() || ''
        for (const block of parts) {
          if (!block.trim()) continue
          let evtName = 'message'; let dataLine = ''
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) evtName = line.slice(7).trim()
            else if (line.startsWith('data: ')) dataLine += line.slice(6)
          }
          let payload: any = {}
          try { payload = JSON.parse(dataLine) } catch {}
          if (evtName === 'step')              setEvents(e => [...e, { kind: 'step',        label: payload.label || '' }])
          else if (evtName === 'tool_call')    setEvents(e => [...e, { kind: 'tool_call',   id: payload.id, name: payload.name, args: payload.args }])
          else if (evtName === 'tool_result')  setEvents(e => [...e, { kind: 'tool_result', id: payload.id, name: payload.name, ok: payload.ok, summary: payload.summary, raw: payload.raw }])
          else if (evtName === 'confirm_required') setEvents(e => [...e, {
            kind: 'confirm_required', id: payload.id, name: payload.name,
            args: payload.args, action: payload.action, status: 'pending',
          }])
          else if (evtName === 'answer_chunk') setAnswer(a => a + (payload.text || ''))
          else if (evtName === 'deck_ready')   setEvents(e => [...e, { kind: 'deck_ready', deck: payload as DeckReady }])
          else if (evtName === 'word_ready')   setEvents(e => [...e, { kind: 'word_ready', word: payload as WordReady }])
          else if (evtName === 'error')        setEvents(e => [...e, { kind: 'error', message: payload.message || 'Agent error' }])
          else if (evtName === 'done')         { /* handled by stream end */ }
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') setEvents(ev => [...ev, { kind: 'error', message: e?.message || 'Network error' }])
    } finally {
      setRunning(false)
    }
  }, [prompt, running])

  function reset() {
    abortRef.current?.abort()
    setRunning(false); setEvents([]); setAnswer(''); setActiveQuestion('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }
  function openInResearch() {
    router.push('/app/research?q=' + encodeURIComponent(activeQuestion || prompt.trim()))
    onClose()
  }

  // Apply (or reject) a pending confirm card. On approval we POST/DELETE
  // through the platform's regular peer-set API (which audit-logs and
  // enforces RLS) and then mutate the matching event in place so the card
  // renders its terminal state.
  const handleConfirm = useCallback(async (id: string, approve: boolean) => {
    const evt = events.find((e): e is Extract<AgentEvent, { kind: 'confirm_required' }> =>
      e.kind === 'confirm_required' && e.id === id)
    if (!evt || !evt.action) return
    if (!approve) {
      setEvents(es => es.map(e => (e.kind === 'confirm_required' && e.id === id) ? { ...e, status: 'rejected' as const } : e))
      return
    }
    setEvents(es => es.map(e => (e.kind === 'confirm_required' && e.id === id) ? { ...e, status: 'approved' as const } : e))
    try {
      const init: RequestInit = { method: evt.action.method, credentials: 'include' }
      if (evt.action.body) {
        init.headers = { 'Content-Type': 'application/json' }
        init.body = JSON.stringify(evt.action.body)
      }
      const r = await fetch(evt.action.endpoint, init)
      const ok = r.ok
      const j = ok ? await r.json().catch(() => ({})) : await r.text().catch(() => '')
      setEvents(es => es.map(e => (e.kind === 'confirm_required' && e.id === id) ? {
        ...e,
        status: ok ? 'applied' as const : 'failed' as const,
        resultMessage: ok
          ? (j?.report?.title
              ? `Saved report "${j.report.title}". Open it in Reports to edit or export.`
              : j?.set?.name
                ? `Saved as "${j.set.name}".`
                : 'Applied.')
          : `Failed: ${String(j).slice(0, 120)}`,
      } : e))
    } catch (err: any) {
      setEvents(es => es.map(e => (e.kind === 'confirm_required' && e.id === id) ? {
        ...e, status: 'failed' as const, resultMessage: err?.message || 'Network error',
      } : e))
    }
  }, [events])

  const inSession = !!activeQuestion

  return (
    <>
      <div onClick={onClose} aria-hidden style={{
        position:'fixed',inset:0,background:'rgba(8,14,26,0.55)',backdropFilter:'blur(4px)',
        zIndex:1100,
        display: open ? 'block' : 'none',
      }}/>
      <div role="dialog" aria-modal="true" aria-labelledby="ask-ai-title"
        aria-hidden={!open}
        style={{
        position:'fixed',top:0,right:0,bottom:0,width:'min(580px, 100vw)',zIndex:1101,
        background:'var(--bg-card)',borderLeft:'1px solid var(--border)',
        boxShadow:'-12px 0 48px rgba(0,0,0,0.35)',
        flexDirection:'column',
        animation: open ? 'slideInRight 0.22s ease' : undefined,
        display: open ? 'flex' : 'none',
        visibility: open ? 'visible' : 'hidden',
        pointerEvents: open ? 'auto' : 'none',
      }}>
        {/* Header */}
        <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12}}>
          <div style={{
            width:36,height:36,borderRadius:10,background:'var(--gradient-brand)',
            display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',
            boxShadow:'0 4px 14px var(--accent-dim)',
          }}>
            <ACTION_ICONS.sparkles width={18} height={18} strokeWidth={2}/>
          </div>
          <div style={{flex:1}}>
            <div id="ask-ai-title" style={{fontSize:15,fontWeight:800,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Finsyt Agent</div>
            <div style={{fontSize:11.5,color:'var(--text-secondary)',marginTop:2}}>Plans · searches sources · cites every claim</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)',padding:6,borderRadius:6,display:'inline-flex'}}>
            <ACTION_ICONS.close width={18} height={18} strokeWidth={ICON_STROKE}/>
          </button>
        </div>

        {/* Body */}
        <div ref={scrollRef} style={{flex:1,overflowY:'auto',padding:'22px'}}>
          {inSession ? (
            <AgentTranscript
              question={activeQuestion}
              events={events}
              answer={answer}
              running={running}
              onReset={reset}
              onOpenInResearch={openInResearch}
              onConfirm={handleConfirm}
            />
          ) : (
            <Lobby recentRuns={recentRuns} onPick={(p) => { setPrompt(p); inputRef.current?.focus() }} onRunNow={(p) => { void runQuery(p) }} />
          )}
        </div>

        {/* Composer */}
        <div style={{padding:'14px 18px',borderTop:'1px solid var(--border)',background:'var(--bg-elevated)'}}>
          <div style={{
            display:'flex',gap:8,alignItems:'flex-end',
            background:'var(--bg-input)',border:'1.5px solid var(--border)',
            borderRadius:12,padding:'10px 12px',transition:'border-color 0.14s, box-shadow 0.14s',
            opacity: running ? 0.7 : 1,
          }}>
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void runQuery() } }}
              placeholder={running ? 'Agent is working…' : (inSession ? 'Ask a follow-up…' : 'Ask anything across your coverage…')}
              rows={2}
              disabled={running}
              style={{
                flex:1,background:'transparent',border:'none',outline:'none',
                resize:'none',fontFamily:'inherit',fontSize:13.5,lineHeight:1.5,
                color:'var(--text-primary)',
              }}
            />
            <button onClick={() => void runQuery()} disabled={!prompt.trim() || running}
              style={{
                background:(prompt.trim() && !running) ?'var(--gradient-brand)':'var(--hover)',
                color:(prompt.trim() && !running) ?'#fff':'var(--text-muted)',
                border:'none',borderRadius:8,padding:'8px 14px',
                fontSize:12,fontWeight:700,cursor:(prompt.trim() && !running) ?'pointer':'not-allowed',
                fontFamily:'inherit',flexShrink:0,display:'inline-flex',alignItems:'center',gap:6,
              }}>
              {running ? '…' : <><ACTION_ICONS.send width={12} height={12} strokeWidth={ICON_STROKE}/> Run</>}
            </button>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8,fontSize:10.5,color:'var(--text-muted)'}}>
            <span><Kbd>Enter</Kbd> send · <Kbd>Shift+Enter</Kbd> newline</span>
            <span><Kbd>Esc</Kbd> close</span>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Lobby — replaces brochure SUGGESTIONS with live workspace runs. */
function Lobby({
  recentRuns, onPick, onRunNow,
}: {
  recentRuns: ReturnType<typeof useAgents>['runs']
  onPick: (prompt: string) => void
  onRunNow: (prompt: string) => void
}) {
  // Generic, page-agnostic starting points. We surface them only when the
  // user has no recent runs yet, so power users never see brochure copy.
  const STARTERS = [
    'Summarise what changed across my coverage in the last 24 hours.',
    'Compare my peers on NTM forward P/E and EV/EBITDA — flag any outliers.',
    'Pull the latest 10-K filings on my watchlist and surface risk-factor diffs.',
    'What did the Street ask on the most recent earnings calls in my coverage?',
    'Compare gross margin trajectory across my watchlist over the last 8 quarters.',
  ]
  const hasRuns = recentRuns.length > 0
  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      {hasRuns && (
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-muted)',textTransform:'uppercase'}}>Recent agent runs</span>
            <Link href="/app/agents/inbox" style={{fontSize:11,color:'var(--accent-text)',textDecoration:'none',fontWeight:600,display:'inline-flex',alignItems:'center',gap:4}}>
              Open inbox <ACTION_ICONS.arrowRight width={11} height={11} strokeWidth={ICON_STROKE}/>
            </Link>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {recentRuns.map(r => (
              <button key={r.id} onClick={() => onRunNow(`Re-run "${r.agentName}" and tell me what changed since ${relTime(r.ranAt)}.`)}
                style={{
                  display:'flex',alignItems:'flex-start',gap:10,textAlign:'left',
                  padding:'10px 12px',borderRadius:10,border:'1px solid var(--border)',
                  background:'var(--bg-elevated)',cursor:'pointer',fontFamily:'inherit',
                  transition:'border-color .12s, background .12s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor='var(--accent)'; (e.currentTarget as HTMLElement).style.background='var(--hover)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor='var(--border)'; (e.currentTarget as HTMLElement).style.background='var(--bg-elevated)' }}>
                <span style={{
                  display:'inline-flex',alignItems:'center',justifyContent:'center',
                  width:26,height:26,borderRadius:7,background:'var(--accent-dim)',color:'var(--accent-text)',flexShrink:0,
                }}>
                  <NAV_ICONS.agents width={14} height={14} strokeWidth={ICON_STROKE}/>
                </span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12.5,fontWeight:700,color:'var(--text-primary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.headline}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{r.agentName} · {relTime(r.ranAt)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-muted)',textTransform:'uppercase',marginBottom:10}}>
          {hasRuns ? 'Or ask something new' : 'Try a starting point'}
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {STARTERS.map(s => (
            <button key={s} onClick={() => onPick(s)}
              style={{
                display:'flex',alignItems:'flex-start',gap:10,textAlign:'left',
                padding:'10px 12px',borderRadius:10,border:'1px solid var(--border)',
                background:'var(--bg-elevated)',color:'var(--text-primary)',
                fontSize:13,lineHeight:1.5,cursor:'pointer',fontFamily:'inherit',
                transition:'border-color 0.12s, background 0.12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor='var(--accent)'; (e.currentTarget as HTMLElement).style.background='var(--hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor='var(--border)'; (e.currentTarget as HTMLElement).style.background='var(--bg-elevated)' }}>
              <ACTION_ICONS.sparkles width={14} height={14} strokeWidth={ICON_STROKE} color="var(--accent-text)" style={{marginTop:2,flexShrink:0}}/>
              <span>{s}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Live agent transcript: planning → tool calls → cited answer.
   ──────────────────────────────────────────────────────────────────────── */
function AgentTranscript({
  question, events, answer, running, onReset, onOpenInResearch, onConfirm,
}: {
  question: string
  events: AgentEvent[]
  answer: string
  running: boolean
  onReset: () => void
  onOpenInResearch: () => void
  onConfirm: (id: string, approve: boolean) => void
}) {
  const toolCalls   = events.filter(e => e.kind === 'tool_call') as Extract<AgentEvent,{kind:'tool_call'}>[]
  const toolResults = events.filter(e => e.kind === 'tool_result') as Extract<AgentEvent,{kind:'tool_result'}>[]
  const errors      = events.filter(e => e.kind === 'error') as Extract<AgentEvent,{kind:'error'}>[]
  const stepLabels  = (events.filter(e => e.kind === 'step') as Extract<AgentEvent,{kind:'step'}>[]).map(s => s.label)
  const confirms    = events.filter(e => e.kind === 'confirm_required') as Extract<AgentEvent,{kind:'confirm_required'}>[]
  const compareResults = toolResults.filter(r => r.name === 'compare_peers' && r.raw)
  const decks       = events.filter(e => e.kind === 'deck_ready') as Extract<AgentEvent,{kind:'deck_ready'}>[]
  const words       = events.filter(e => e.kind === 'word_ready') as Extract<AgentEvent,{kind:'word_ready'}>[]

  return (
    <div style={{display:'flex',flexDirection:'column',gap:18}}>
      <div style={{
        padding:'12px 14px',borderRadius:10,background:'var(--bg-elevated)',
        border:'1px solid var(--border)',fontSize:13.5,color:'var(--text-primary)',lineHeight:1.55,
      }}>
        <div style={{fontSize:10.5,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-muted)',textTransform:'uppercase',marginBottom:6}}>You asked</div>
        {question}
      </div>

      {(stepLabels.length > 0 || running) && (
        <div>
          <div style={{fontSize:10.5,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-muted)',textTransform:'uppercase',marginBottom:8}}>Agent timeline</div>
          <ol style={{listStyle:'none',padding:0,margin:0,display:'flex',flexDirection:'column',gap:6}}>
            {stepLabels.map((label, i) => (
              <li key={'s'+i} style={{display:'flex',gap:10,alignItems:'center',fontSize:12.5,color:'var(--text-secondary)'}}>
                <span style={{width:14,height:14,borderRadius:99,border:'1.5px solid var(--accent)',background:'var(--accent-dim)',flexShrink:0}}/>
                {label}
              </li>
            ))}
            {running && (
              <li style={{display:'flex',gap:10,alignItems:'center',fontSize:12.5,color:'var(--accent-text)'}}>
                <ACTION_ICONS.loader width={14} height={14} strokeWidth={ICON_STROKE} style={{animation:'spin 1s linear infinite',flexShrink:0}}/>
                Working…
              </li>
            )}
          </ol>
        </div>
      )}

      {toolCalls.length > 0 && (
        <div>
          <div style={{fontSize:10.5,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-muted)',textTransform:'uppercase',marginBottom:8}}>Sources called</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {toolCalls.map(tc => {
              const res = toolResults.find(r => r.id === tc.id)
              const argSummary = Object.entries(tc.args || {}).map(([k,v]) => `${k}=${v}`).join(' · ')
              const hasRaw = !!res?.raw
              return (
                <details key={tc.id} style={{
                  borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-card)',fontSize:12,
                }}>
                  <summary style={{
                    display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,
                    padding:'8px 10px',cursor: hasRaw ? 'pointer' : 'default',listStyle:'none',
                  }}>
                    <div style={{display:'flex',gap:8,alignItems:'center',minWidth:0}}>
                      <code style={{fontSize:11,padding:'2px 6px',borderRadius:4,background:'var(--accent-dim)',color:'var(--accent-text)',fontWeight:700}}>{tc.name}</code>
                      <span style={{color:'var(--text-secondary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{argSummary || '—'}</span>
                    </div>
                    <span style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                      <span style={{fontSize:11,color: res ? (res.ok ? 'var(--success)' : 'var(--error)') : 'var(--text-muted)',whiteSpace:'nowrap'}}>
                        {res ? res.summary : 'pending…'}
                      </span>
                      {hasRaw && <ACTION_ICONS.chevronDown width={11} height={11} strokeWidth={ICON_STROKE}/>}
                    </span>
                  </summary>
                  {hasRaw && (
                    <pre style={{
                      margin:0,padding:'10px 12px',borderTop:'1px solid var(--border)',
                      background:'var(--bg-page)',color:'var(--text-secondary)',
                      fontSize:11,lineHeight:1.5,maxHeight:280,overflow:'auto',
                      whiteSpace:'pre-wrap',wordBreak:'break-word',
                      fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace',
                    }}>{(() => { try { return JSON.stringify(JSON.parse(res!.raw!), null, 2) } catch { return res!.raw } })()}</pre>
                  )}
                </details>
              )
            })}
          </div>
        </div>
      )}

      {confirms.length > 0 && (
        <div>
          <div style={{fontSize:10.5,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-muted)',textTransform:'uppercase',marginBottom:8}}>Awaiting your approval</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {confirms.map(c => <ConfirmCard key={c.id} evt={c} onConfirm={onConfirm} />)}
          </div>
        </div>
      )}

      {compareResults.length > 0 && (
        <div>
          <div style={{fontSize:10.5,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-muted)',textTransform:'uppercase',marginBottom:8}}>Peer comparison</div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {compareResults.map(r => <CompareInlineTable key={r.id} raw={r.raw!} />)}
          </div>
        </div>
      )}

      {decks.map((d, i) => <DeckFileCard key={'deck'+i} deck={d.deck} />)}
      {words.map((w, i) => <WordFileCard key={'word'+i} word={w.word} />)}

      {errors.length > 0 && (
        <div style={{padding:'10px 12px',borderRadius:8,border:'1px solid var(--error)',background:'rgba(239,68,68,0.08)',fontSize:12,color:'var(--error)',display:'flex',gap:8,alignItems:'flex-start'}}>
          <ACTION_ICONS.warn width={14} height={14} strokeWidth={ICON_STROKE} style={{flexShrink:0,marginTop:1}}/>
          <div>{errors.map((e,i) => <div key={'e'+i}>{e.message}</div>)}</div>
        </div>
      )}

      {answer && (
        <div>
          <div style={{fontSize:10.5,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-muted)',textTransform:'uppercase',marginBottom:8}}>Answer</div>
          <div style={{
            padding:'14px 16px',borderRadius:12,border:'1px solid var(--border)',
            background:'var(--bg-card)',fontSize:13,lineHeight:1.65,color:'var(--text-primary)',
            whiteSpace:'pre-wrap',
          }}>{answer}{running && <span style={{opacity:0.5}}>▍</span>}</div>
        </div>
      )}

      {!running && (answer || errors.length > 0) && (
        <div style={{display:'flex',gap:8,paddingTop:4,flexWrap:'wrap'}}>
          <button onClick={onReset} style={{
            display:'inline-flex',alignItems:'center',gap:6,
            padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',
            background:'var(--bg-elevated)',color:'var(--text-primary)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
          }}><ACTION_ICONS.reset width={12} height={12} strokeWidth={ICON_STROKE}/> New question</button>
          <button onClick={onOpenInResearch} style={{
            display:'inline-flex',alignItems:'center',gap:6,
            padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',
            background:'var(--bg-elevated)',color:'var(--text-primary)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
          }}>Open in Research <ACTION_ICONS.arrowUpRight width={12} height={12} strokeWidth={ICON_STROKE}/></button>
          {answer && <PinAnswerButton question={question} answer={answer} />}
          {answer && <CopyAnswerButton answer={answer} />}
          {answer && <EmailDraftButton question={question} answer={answer} />}
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Research & Analysis file card surfaced in the Finsyt Agent drawer when the
   agent has produced a downloadable artifact (e.g. an investment memo
   PPTX). Renders a horizontal thumbnail strip + a primary Download button.
   ──────────────────────────────────────────────────────────────────────── */
function DeckFileCard({ deck }: { deck: DeckReady }) {
  const sizeKb = Math.max(1, Math.round(deck.bytes / 1024))
  const missing = Object.entries(deck.sectionAvailability || {}).filter(([, ok]) => !ok).map(([k]) => k)
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)
  const preview = previewIdx != null ? deck.thumbnails.find(t => t.index === previewIdx) : null

  // Close preview on Escape, navigate with arrow keys.
  useEffect(() => {
    if (previewIdx == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setPreviewIdx(null); return }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const total = deck.thumbnails.length
        if (!total) return
        const cur = deck.thumbnails.findIndex(t => t.index === previewIdx)
        const next = e.key === 'ArrowRight'
          ? (cur + 1) % total
          : (cur - 1 + total) % total
        setPreviewIdx(deck.thumbnails[next].index)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewIdx, deck.thumbnails])

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
        <span style={{
          display:'inline-flex',alignItems:'center',gap:6,
          padding:'3px 8px',borderRadius:99,background:'var(--accent-dim)',color:'var(--accent-text)',
          fontSize:10.5,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',
        }}>
          <ACTION_ICONS.sparkles width={11} height={11} strokeWidth={2.2}/>
          Research &amp; Analysis
        </span>
        <span style={{fontSize:11,color:'var(--text-muted)'}}>generated just now · {deck.asOf}</span>
      </div>

      <div style={{
        border:'1px solid var(--border)',borderRadius:14,background:'var(--bg-card)',
        padding:14,display:'flex',flexDirection:'column',gap:12,
        boxShadow:'0 4px 14px rgba(8,14,26,0.06)',
      }}>
        <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
          <div style={{
            width:44,height:44,borderRadius:10,
            background:'linear-gradient(135deg,#0B1B3D,#4F7CFF)',
            color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:11,fontWeight:800,letterSpacing:'0.05em',flexShrink:0,
          }}>PPTX</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13.5,fontWeight:800,color:'var(--text-primary)',lineHeight:1.3,letterSpacing:'-0.005em'}}>
              {deck.companyName} · Investment Memo
            </div>
            <div style={{fontSize:11.5,color:'var(--text-secondary)',marginTop:3}}>
              {deck.ticker} · {deck.slideTitles.length} slides · {sizeKb} KB
            </div>
            <div style={{fontSize:10.5,color:'var(--text-muted)',marginTop:3}}>
              {deck.sourceLine}
            </div>
          </div>
          <a href={deck.downloadUrl} download={deck.filename} style={{
            display:'inline-flex',alignItems:'center',gap:6,
            background:'var(--gradient-brand)',color:'#fff',
            border:'none',borderRadius:8,padding:'9px 14px',
            fontSize:12.5,fontWeight:700,cursor:'pointer',textDecoration:'none',
            boxShadow:'0 4px 12px var(--accent-dim)',
          }}>
            <ACTION_ICONS.download width={13} height={13} strokeWidth={2.2}/>
            Download
          </a>
        </div>

        {/* Horizontal slide thumbnail strip */}
        <div style={{
          display:'grid',gridAutoFlow:'column',gridAutoColumns:'160px',
          gap:8,overflowX:'auto',paddingBottom:4,marginInline:-2,paddingInline:2,
        }}>
          {deck.thumbnails.map(t => (
            <button
              key={t.index}
              type="button"
              onClick={() => setPreviewIdx(t.index)}
              aria-label={`Preview slide ${t.index} — ${t.title}`}
              title={`Preview slide ${t.index} — ${t.title}`}
              style={{
                display:'block',borderRadius:8,overflow:'hidden',padding:0,
                border:'1px solid var(--border)',background:'#fff',cursor:'pointer',
                textAlign:'left',font:'inherit',color:'inherit',
              }}
            >
              <img src={t.src} alt={t.title} width={160} height={90} style={{display:'block',width:'100%',height:'auto',pointerEvents:'none'}}/>
              <div style={{
                padding:'6px 8px',fontSize:10.5,color:'var(--text-secondary)',
                whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
                borderTop:'1px solid var(--border)',background:'var(--bg-elevated)',
              }}>{t.index}. {t.title}</div>
            </button>
          ))}
        </div>

        {missing.length > 0 && (
          <div style={{
            fontSize:11,color:'var(--text-muted)',padding:'8px 10px',
            background:'var(--bg-elevated)',border:'1px dashed var(--border)',borderRadius:8,
            display:'flex',gap:6,alignItems:'flex-start',
          }}>
            <ACTION_ICONS.warn width={12} height={12} strokeWidth={ICON_STROKE} style={{marginTop:2,flexShrink:0,color:'var(--text-secondary)'}}/>
            <span><strong style={{color:'var(--text-secondary)'}}>Some sections shown as "Data unavailable":</strong> {missing.join(', ')}. Upstream provider returned empty for these.</span>
          </div>
        )}
      </div>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Slide ${preview.index} preview — ${preview.title}`}
          onClick={() => setPreviewIdx(null)}
          style={{
            position:'fixed',inset:0,background:'rgba(8,14,26,0.78)',
            display:'flex',alignItems:'center',justifyContent:'center',
            zIndex:9999,padding:24,backdropFilter:'blur(4px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background:'#fff',borderRadius:14,boxShadow:'0 24px 60px rgba(0,0,0,0.4)',
              maxWidth:'min(960px, 92vw)',width:'100%',display:'flex',flexDirection:'column',
              overflow:'hidden',
            }}
          >
            <div style={{
              display:'flex',alignItems:'center',justifyContent:'space-between',
              padding:'10px 14px',borderBottom:'1px solid var(--border)',background:'var(--bg-elevated)',
            }}>
              <div style={{fontSize:12.5,fontWeight:700,color:'var(--text-primary)'}}>
                Slide {preview.index} of {deck.thumbnails.length} · {preview.title}
              </div>
              <div style={{display:'flex',gap:6}}>
                <button
                  type="button"
                  onClick={() => {
                    const total = deck.thumbnails.length
                    const cur = deck.thumbnails.findIndex(t => t.index === preview.index)
                    setPreviewIdx(deck.thumbnails[(cur - 1 + total) % total].index)
                  }}
                  aria-label="Previous slide"
                  style={{padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontSize:12}}
                >‹ Prev</button>
                <button
                  type="button"
                  onClick={() => {
                    const total = deck.thumbnails.length
                    const cur = deck.thumbnails.findIndex(t => t.index === preview.index)
                    setPreviewIdx(deck.thumbnails[(cur + 1) % total].index)
                  }}
                  aria-label="Next slide"
                  style={{padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontSize:12}}
                >Next ›</button>
                <button
                  type="button"
                  onClick={() => setPreviewIdx(null)}
                  aria-label="Close preview"
                  style={{padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontSize:12,fontWeight:700}}
                >Close ✕</button>
              </div>
            </div>
            <div style={{
              background:'#0B1B3D',padding:24,display:'flex',
              alignItems:'center',justifyContent:'center',
            }}>
              <img
                src={preview.src}
                alt={`Slide ${preview.index} — ${preview.title}`}
                style={{width:'100%',height:'auto',maxHeight:'70vh',objectFit:'contain',background:'#fff',borderRadius:6,boxShadow:'0 6px 20px rgba(0,0,0,0.3)'}}
              />
            </div>
            <div style={{
              padding:'10px 14px',borderTop:'1px solid var(--border)',
              display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,
              background:'var(--bg-elevated)',
            }}>
              <span style={{fontSize:11,color:'var(--text-muted)'}}>
                Use ← → to navigate · Esc to close · this is a preview thumbnail; the full deck is in the .pptx download.
              </span>
              <a href={deck.downloadUrl} download={deck.filename} style={{
                display:'inline-flex',alignItems:'center',gap:6,
                background:'var(--gradient-brand)',color:'#fff',
                border:'none',borderRadius:8,padding:'7px 12px',
                fontSize:12,fontWeight:700,textDecoration:'none',
              }}>
                <ACTION_ICONS.download width={12} height={12} strokeWidth={2.2}/>
                Download .pptx
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Word memo file card — rendered when the agent emits a word_ready SSE event.
   The dataUrl is the complete .docx encoded as a base64 data-URI so the
   download is a one-click client-side blob save — no second server fetch.
   ──────────────────────────────────────────────────────────────────────── */
function WordFileCard({ word }: { word: WordReady }) {
  const sizeKb = Math.max(1, Math.round(word.bytes / 1024))

  function download() {
    const a = document.createElement('a')
    a.href = word.dataUrl
    a.download = word.filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
        <span style={{
          display:'inline-flex',alignItems:'center',gap:6,
          padding:'3px 8px',borderRadius:99,background:'rgba(37,99,235,0.15)',color:'#93c5fd',
          fontSize:10.5,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',
        }}>
          <ACTION_ICONS.sparkles width={11} height={11} strokeWidth={2.2}/>
          Word Memo
        </span>
        <span style={{fontSize:11,color:'var(--text-muted)'}}>generated just now · {word.asOf}</span>
      </div>

      <div style={{
        border:'1px solid var(--border)',borderRadius:14,background:'var(--bg-card)',
        padding:14,display:'flex',flexDirection:'column',gap:12,
        boxShadow:'0 4px 14px rgba(8,14,26,0.06)',
      }}>
        <div style={{display:'flex',gap:12,alignItems:'center'}}>
          {/* Word document icon */}
          <div style={{
            width:44,height:52,borderRadius:6,flexShrink:0,
            background:'linear-gradient(135deg,#1d4ed8,#2563eb)',
            display:'flex',alignItems:'center',justifyContent:'center',
            boxShadow:'0 2px 8px rgba(37,99,235,0.35)',
          }}>
            <span style={{color:'#fff',fontSize:14,fontWeight:900,letterSpacing:-1}}>W</span>
          </div>

          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13.5,fontWeight:700,color:'var(--text-primary)',marginBottom:2,lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {word.filename}
            </div>
            <div style={{fontSize:11,color:'var(--text-muted)'}}>
              Investment Memo · {sizeKb} KB · Word / .docx
            </div>
          </div>

          <button
            onClick={download}
            style={{
              display:'inline-flex',alignItems:'center',gap:6,flexShrink:0,
              background:'linear-gradient(135deg,#1d4ed8,#2563eb)',color:'#fff',
              border:'none',borderRadius:9,padding:'8px 14px',
              fontSize:12.5,fontWeight:700,cursor:'pointer',fontFamily:'inherit',
              boxShadow:'0 2px 10px rgba(37,99,235,0.35)',
            }}
          >
            <ACTION_ICONS.download width={12} height={12} strokeWidth={2.2}/>
            Download .docx
          </button>
        </div>
      </div>
    </div>
  )
}

function PinAnswerButton({ question, answer }: { question: string; answer: string }) {
  const [pinned, setPinned] = useState(false)
  function pin() {
    try {
      const raw = localStorage.getItem('finsyt:pinned-answers')
      const list = raw ? JSON.parse(raw) : []
      const entry = { id: 'pin-' + Date.now(), question, answer, ts: Date.now() }
      const next = [entry, ...list].slice(0, 30)
      localStorage.setItem('finsyt:pinned-answers', JSON.stringify(next))
      setPinned(true)
    } catch {}
  }
  return (
    <button onClick={pin} disabled={pinned} style={{
      display:'inline-flex',alignItems:'center',gap:6,
      padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',
      background: pinned ? 'var(--accent-dim)' : 'var(--bg-elevated)',
      color: pinned ? 'var(--accent-text)' : 'var(--text-primary)',
      fontSize:12,fontWeight:600,cursor: pinned ? 'default' : 'pointer',fontFamily:'inherit',
    }}>
      {pinned ? <><ACTION_ICONS.check width={12} height={12} strokeWidth={ICON_STROKE}/> Pinned</> : <><ACTION_ICONS.pin width={12} height={12} strokeWidth={ICON_STROKE}/> Pin to notes</>}
    </button>
  )
}

/* Inline confirm card surfaced for kind:'write' tool calls (peer set
   create / add / remove). Mutates only after the user clicks Approve. */
function ConfirmCard({
  evt, onConfirm,
}: {
  evt: Extract<AgentEvent, { kind: 'confirm_required' }>
  onConfirm: (id: string, approve: boolean) => void
}) {
  const status = evt.status
  const action = evt.action
  const tone =
    status === 'applied'  ? { bg: 'rgba(34,197,94,0.08)',  br: 'var(--success)', label: 'Applied' } :
    status === 'failed'   ? { bg: 'rgba(239,68,68,0.08)',  br: 'var(--error)',   label: 'Failed'  } :
    status === 'rejected' ? { bg: 'var(--bg-elevated)',    br: 'var(--border)',  label: 'Rejected'} :
    status === 'approved' ? { bg: 'var(--accent-dim)',     br: 'var(--accent)',  label: 'Applying…'} :
                            { bg: 'var(--bg-card)',        br: 'var(--accent)',  label: 'Awaiting confirmation' }
  return (
    <div style={{
      borderRadius:10, border:`1.5px solid ${tone.br}`, background: tone.bg,
      padding:'10px 12px', display:'flex', flexDirection:'column', gap:8,
    }}>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <code style={{fontSize:11,padding:'2px 6px',borderRadius:4,background:'var(--accent-dim)',color:'var(--accent-text)',fontWeight:700}}>{evt.name}</code>
        <span style={{fontSize:11,color:'var(--text-muted)'}}>{tone.label}</span>
      </div>
      <div style={{fontSize:13,color:'var(--text-primary)',lineHeight:1.5}}>{action?.summary || 'No action details.'}</div>
      {evt.resultMessage && (
        <div style={{fontSize:11.5,color:'var(--text-secondary)'}}>{evt.resultMessage}</div>
      )}
      {status === 'pending' && action && (
        <div style={{display:'flex',gap:8,marginTop:2}}>
          <button onClick={() => onConfirm(evt.id, true)}
            style={{padding:'6px 12px',borderRadius:6,border:'none',background:'var(--accent)',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
            Approve
          </button>
          <button onClick={() => onConfirm(evt.id, false)}
            style={{padding:'6px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-elevated)',color:'var(--text-primary)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

/* Inline compare-table panel rendered when the agent calls compare_peers.
   Shows a compact preview; users can deep-link to /app/peers for full UX. */
function CompareInlineTable({ raw }: { raw: string }) {
  let payload: any = null
  try { payload = JSON.parse(raw) } catch { return null }
  if (!payload || !Array.isArray(payload.rows) || payload.rows.length === 0) return null
  const fmt = (n: any, d = 1) => (typeof n === 'number' && Number.isFinite(n)) ? n.toFixed(d) + '×' : '—'
  const fmtPct = (n: any, d = 1) => (typeof n === 'number' && Number.isFinite(n)) ? n.toFixed(d) + '%' : '—'
  return (
    <div style={{borderRadius:10,border:'1px solid var(--border)',background:'var(--bg-card)',overflow:'hidden'}}>
      <div style={{padding:'8px 12px',borderBottom:'1px solid var(--border)',fontSize:11.5,color:'var(--text-secondary)',display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontWeight:700,color:'var(--text-primary)'}}>{payload.setName || 'Peer comparison'}</span>
        <span>· anchor {payload.anchor || '—'}</span>
        <span style={{marginLeft:'auto',fontSize:10,padding:'2px 6px',borderRadius:4,background:'var(--accent-dim)',color:'var(--accent-text)',fontWeight:700}}>demo</span>
      </div>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead>
          <tr style={{background:'var(--bg-elevated)',color:'var(--text-muted)',textTransform:'uppercase',fontSize:10,letterSpacing:'0.05em'}}>
            <th style={{textAlign:'left',padding:'6px 10px'}}>Symbol</th>
            <th style={{textAlign:'right',padding:'6px 10px'}}>Fwd P/E</th>
            <th style={{textAlign:'right',padding:'6px 10px'}}>EV / EBITDA</th>
            <th style={{textAlign:'right',padding:'6px 10px'}}>Opts ITM%</th>
          </tr>
        </thead>
        <tbody>
          {payload.rows.slice(0, 12).map((r: any) => (
            <tr key={r.symbol} style={{borderTop:'1px solid var(--border)',background: r.isAnchor ? 'var(--accent-dim)' : 'transparent'}}>
              <td style={{padding:'6px 10px',fontWeight: r.isAnchor ? 800 : 600,color:'var(--text-primary)'}}>{r.symbol}</td>
              <td style={{padding:'6px 10px',textAlign:'right',color:'var(--text-secondary)',fontVariantNumeric:'tabular-nums'}}>{fmt(r.forwardPe)}</td>
              <td style={{padding:'6px 10px',textAlign:'right',color:'var(--text-secondary)',fontVariantNumeric:'tabular-nums'}}>{fmt(r.evEbitdaNtm)}</td>
              <td style={{padding:'6px 10px',textAlign:'right',color:'var(--text-secondary)',fontVariantNumeric:'tabular-nums'}}>{fmtPct(r.optionsItmPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{padding:'6px 12px',borderTop:'1px solid var(--border)',fontSize:10.5,color:'var(--text-muted)'}}>
        NTM and exercisable-options metrics are deterministic synthesised demo values. Open <Link href="/app/peers" style={{color:'var(--accent-text)',textDecoration:'none',fontWeight:700}}>Peers</Link> for the full institutional view.
      </div>
    </div>
  )
}

function CopyAnswerButton({ answer }: { answer: string }) {
  const [done, setDone] = useState(false)
  function copy() {
    try {
      navigator.clipboard?.writeText(answer)
      setDone(true)
      setTimeout(() => setDone(false), 1600)
    } catch {}
  }
  return (
    <button onClick={copy} style={{
      display:'inline-flex',alignItems:'center',gap:6,
      padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',
      background:'var(--bg-elevated)',color:'var(--text-primary)',
      fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
    }}>
      {done ? <><ACTION_ICONS.check width={12} height={12} strokeWidth={ICON_STROKE}/> Copied</> : <><ACTION_ICONS.copy width={12} height={12} strokeWidth={ICON_STROKE}/> Copy answer</>}
    </button>
  )
}

function EmailDraftButton({ question, answer }: { question: string; answer: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState<string | null>(null)

  const BASE = typeof window !== 'undefined'
    ? (document.querySelector<HTMLMetaElement>('meta[name="base-path"]')?.content || '')
    : ''

  async function download() {
    setBusy(true); setErr(null)
    try {
      const subject = question.trim().slice(0, 120) || 'Finsyt Research Summary'
      // Extract a ticker mentioned in the question (simple heuristic: uppercase word 2–5 chars)
      const tickerMatch = question.match(/\b([A-Z]{2,5})\b/)
      const ticker = tickerMatch ? tickerMatch[1] : undefined

      const r = await fetch(`${BASE}/api/copilot/eml`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body: answer, ticker }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setErr(j?.error || `Failed (${r.status})`)
        setTimeout(() => setErr(null), 4000)
        return
      }
      const blob = await r.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `${subject.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)}.eml`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setErr(e?.message || 'Export failed')
      setTimeout(() => setErr(null), 4000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={download}
      disabled={busy}
      title="Download as Outlook email draft (.eml)"
      style={{
        display:'inline-flex',alignItems:'center',gap:6,
        padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',
        background:'var(--bg-elevated)',color: err ? 'var(--red)' : 'var(--text-primary)',
        fontSize:12,fontWeight:600,cursor:busy?'wait':'pointer',fontFamily:'inherit',
        opacity: busy ? 0.65 : 1,
      }}
    >
      {err
        ? `⚠ ${err}`
        : busy
          ? 'Generating…'
          : <><span aria-hidden>✉</span> Email draft</>
      }
    </button>
  )
}

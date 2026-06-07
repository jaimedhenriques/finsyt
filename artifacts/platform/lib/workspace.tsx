'use client'
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'

// ── Widget catalogue ─────────────────────────────────────────────────────────
export type WidgetSize = '1x1' | '2x1' | '3x1' | '1x2' | '2x2' | '3x2' | '4x1' | '4x2'

export interface WidgetDef {
  id: string
  label: string
  description: string
  icon: string
  defaultSize: WidgetSize
  category: 'Market Data' | 'AI Research' | 'News' | 'Portfolio' | 'Analytics'
  minW?: number  // grid columns (default 1)
}

export const WIDGET_CATALOGUE: WidgetDef[] = [
  // Market Data
  { id:'indices',        label:'Indices',               description:'Live index values — US, Europe, Asia',  icon:'📈', defaultSize:'3x1', category:'Market Data', minW:2 },
  { id:'earnings_bar',   label:'Earnings Beat/Miss',    description:'S&P 500 earnings beat vs miss tracker', icon:'🏆', defaultSize:'2x1', category:'Market Data', minW:2 },
  { id:'market_movers',  label:'Market Movers',         description:'Most active, top gainers & losers',     icon:'🔄', defaultSize:'2x2', category:'Market Data', minW:2 },
  { id:'sector_perf',    label:'Sector Performance',    description:'S&P 500 sector diverging bar chart',    icon:'🗂', defaultSize:'2x2', category:'Market Data', minW:2 },
  { id:'price_monitor',  label:'Price Monitor',         description:'Real-time price ticker for watchlist',  icon:'💹', defaultSize:'2x1', category:'Market Data', minW:1 },
  { id:'fx_rates',       label:'FX Rates',              description:'Major currency pairs',                  icon:'💱', defaultSize:'2x1', category:'Market Data', minW:1 },
  { id:'macro_snapshot', label:'Macro Snapshot',        description:'Fed rate, CPI, GDP, yield curve',       icon:'🌍', defaultSize:'2x1', category:'Market Data', minW:2 },
  // AI Research
  { id:'ai_query',       label:'AI Research Bar',       description:'Agentic query bar with source filter',  icon:'🤖', defaultSize:'4x1', category:'AI Research', minW:3 },
  { id:'agent_feed',     label:'Agent Activity Feed',   description:'Recent AI analyses and outputs',        icon:'⚡', defaultSize:'2x2', category:'AI Research', minW:2 },
  { id:'prompt_library', label:'Prompt Library',        description:'One-click research workflows',          icon:'📚', defaultSize:'2x2', category:'AI Research', minW:2 },
  { id:'company_summary',label:'Company Summary',       description:'AI-generated company snapshot',         icon:'🏢', defaultSize:'2x2', category:'AI Research', minW:2 },
  // News
  { id:'live_feed',      label:'Live News Feed',        description:'Real-time news with sentiment tags',    icon:'📰', defaultSize:'2x2', category:'News', minW:2 },
  { id:'transcript_feed',label:'Transcript Feed',       description:'Latest earnings call excerpts',         icon:'📋', defaultSize:'2x2', category:'News', minW:2 },
  { id:'filing_feed',    label:'Filing Feed',           description:'SEC and regulatory filings',            icon:'📄', defaultSize:'2x1', category:'News', minW:2 },
  { id:'expert_calls',   label:'Expert Calls',          description:'Curated expert call highlights',        icon:'📞', defaultSize:'2x2', category:'News', minW:2 },
  { id:'earnings_live',  label:'Earnings Live Strip',   description:'Live earnings calls with pulse ring',   icon:'🔴', defaultSize:'4x1', category:'News', minW:3 },
  // Portfolio
  { id:'watchlist',      label:'Watchlist',             description:'Your tracked securities',               icon:'⭐', defaultSize:'3x2', category:'Portfolio', minW:2 },
  { id:'workspace_panel',label:'Workspace Panel',       description:'Price monitor + expert insights grid',  icon:'🗃', defaultSize:'2x2', category:'Portfolio', minW:2 },
  // Analytics
  { id:'channel_check',  label:'Channel Check Table',   description:'Expert channel check synthesis',        icon:'🔍', defaultSize:'4x2', category:'Analytics', minW:3 },
]

// ── Nav items ─────────────────────────────────────────────────────────────────
export interface NavItem {
  id: string
  href: string
  labelKey: string
  iconKey: string
  badge?: string
  visible: boolean
  pinned?: boolean   // always show even if hidden
}

export const DEFAULT_NAV: NavItem[] = [
  { id:'research',   href:'/app/research',  labelKey:'ai_research', iconKey:'ai_research', visible:true, pinned:true },
  { id:'watchlist',  href:'/app/watchlist', labelKey:'watchlist',   iconKey:'watchlist',   visible:true },
  { id:'screener',   href:'/app/screener',  labelKey:'screener',    iconKey:'screener',    visible:true },
  { id:'news',       href:'/app/news',      labelKey:'news_signals',iconKey:'news_signals',visible:true },
  { id:'filings',    href:'/app/filings',   labelKey:'filings',     iconKey:'filings',     visible:true },
  { id:'markets',    href:'/app/markets',   labelKey:'markets',     iconKey:'markets',     visible:true },
  { id:'private',    href:'/app/private',   labelKey:'private',     iconKey:'private',     visible:true },
  { id:'discovery',  href:'/app/discovery', labelKey:'discovery',   iconKey:'discovery',   visible:true },
  { id:'macro',      href:'/app/macro',     labelKey:'macro',       iconKey:'macro',       visible:true },
  { id:'deals',      href:'/app/deals',     labelKey:'deals',       iconKey:'deals',       visible:false },
  { id:'formulas',    href:'/app/formulas',    labelKey:'formulas',    iconKey:'formulas',    visible:true },
  { id:'workspaces', href:'/app/workspaces', labelKey:'workspaces', iconKey:'workspaces', visible:true },
  { id:'alerts',     href:'/app/alerts',    labelKey:'alerts',      iconKey:'alerts',      badge:'3', visible:true },
  { id:'widgets',    href:'/app/widgets',   labelKey:'widgets',     iconKey:'widgets',     visible:true },
  { id:'developer',  href:'/app/developer', labelKey:'developer',   iconKey:'developer',   visible:true },
  { id:'figma',      href:'/app/figma',     labelKey:'figma',       iconKey:'figma',       visible:true },
]

// ── Topbar items ──────────────────────────────────────────────────────────────
export interface TopbarItem {
  id: string
  label: string
  visible: boolean
}

export const DEFAULT_TOPBAR: TopbarItem[] = [
  { id:'search',    label:'Search',          visible:true },
  { id:'indices',   label:'Index Ticker',    visible:true },
  { id:'live_dot',  label:'Live Status Dot', visible:true },
  { id:'alerts',    label:'Alerts Bell',     visible:true },
  { id:'language',  label:'Language Picker', visible:true },
  { id:'avatar',    label:'User Avatar',     visible:true },
]

// ── Page layout — widget grid ─────────────────────────────────────────────────
export interface PlacedWidget {
  id: string          // unique instance id
  widgetId: string    // references WIDGET_CATALOGUE
  order: number
}

export type PageLayouts = Record<string, PlacedWidget[]>

const DEFAULT_HOME_LAYOUT: PlacedWidget[] = [
  { id:'w-earnings-live', widgetId:'earnings_live',  order:0 },
  { id:'w-ai-query',      widgetId:'ai_query',       order:1 },
  { id:'w-live-feed',     widgetId:'live_feed',      order:2 },
  { id:'w-transcript',    widgetId:'transcript_feed',order:3 },
  { id:'w-movers',        widgetId:'market_movers',  order:4 },
  { id:'w-workspace',     widgetId:'workspace_panel',order:5 },
]

const DEFAULT_PAGE_LAYOUTS: PageLayouts = {
  '/app': DEFAULT_HOME_LAYOUT,
}

// ── Theme ────────────────────────────────────────────────────────────────────
// Four background options the user picks in Settings → Appearance.
// Maps to a `data-theme` attribute on <html>; CSS variables in globals.css
// switch the entire palette. "white" is the default (no attribute).
export type ThemeName = 'white' | 'cream' | 'gray' | 'dark'

export const THEME_OPTIONS: Array<{ id: ThemeName; label: string; swatch: string; description: string }> = [
  { id: 'white', label: 'White',      swatch: '#FFFFFF', description: 'Bright neutral, AlphaSense-style' },
  { id: 'cream', label: 'Cream',      swatch: '#FBF7EE', description: 'Warm paper tone, easy on the eyes' },
  { id: 'gray',  label: 'Light Gray', swatch: '#ECEEF2', description: 'Soft slate, subdued contrast' },
  { id: 'dark',  label: 'Black',      swatch: '#060D18', description: 'Trading-floor dark mode' },
]

// ── Screener filter presets ──────────────────────────────────────────────────
// Persists per-workspace (per-browser) so an analyst's saved factor combos
// survive navigation away from the Screener and reloads. Shape is a free-form
// JSON blob so the Screener page can evolve its filter schema without forcing
// a context migration.
export interface ScreenerPreset {
  id: string
  name: string
  filters: Record<string, unknown>
  createdAt: number
  /** True when synced via the org-scoped API (vs. anonymous localStorage). */
  shared?: boolean
  /** Clerk user id of the analyst who created the preset (API rows only). */
  authorUserId?: string
  /** True when the current user owns this preset and may edit/delete it. */
  ownedByMe?: boolean
}

interface ApiPreset {
  id: string
  name: string
  filters: Record<string, unknown>
  shared: boolean
  authorUserId: string
  createdAt: number
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      const body = await res.json() as { error?: unknown }
      if (typeof body.error === 'string' && body.error.trim()) return body.error
    }
  } catch { /* fall through */ }
  return `${fallback} (HTTP ${res.status})`
}

function fromApi(p: ApiPreset, currentUserId: string | null | undefined): ScreenerPreset {
  return {
    id: p.id,
    name: p.name,
    filters: p.filters,
    createdAt: p.createdAt,
    shared: p.shared,
    authorUserId: p.authorUserId,
    ownedByMe: Boolean(currentUserId && p.authorUserId === currentUserId),
  }
}

// ── Context ───────────────────────────────────────────────────────────────────
interface WorkspaceCtx {
  // Nav
  nav: NavItem[]
  setNav: (n: NavItem[]) => void
  // Topbar
  topbar: TopbarItem[]
  setTopbar: (t: TopbarItem[]) => void
  // Page layouts
  layouts: PageLayouts
  setLayout: (page: string, widgets: PlacedWidget[]) => void
  // Edit mode
  editMode: boolean
  setEditMode: (v: boolean) => void
  // Widget picker
  pickerOpen: boolean
  pickerPage: string
  openPicker: (page: string) => void
  closePicker: () => void
  addWidget: (page: string, widgetId: string) => void
  removeWidget: (page: string, instanceId: string) => void
  reorderWidgets: (page: string, widgets: PlacedWidget[]) => void
  // Screener presets
  screenerPresets: ScreenerPreset[]
  /**
   * `true` when presets sync to the workspace via the API and the
   * "Share with workspace" toggle is meaningful. `false` for signed-out
   * users (and signed-in users without an active org), where presets stay
   * in localStorage on this browser only.
   */
  screenerPresetsSynced: boolean
  saveScreenerPreset: <T extends Record<string, unknown>>(
    name: string,
    filters: T,
    opts?: { shared?: boolean },
  ) => Promise<ScreenerPreset>
  deleteScreenerPreset: (id: string) => Promise<void>
  renameScreenerPreset: (id: string, name: string) => Promise<void>
  updateScreenerPreset: <T extends Record<string, unknown>>(id: string, filters: T) => Promise<void>
  // Theme
  theme: ThemeName
  setTheme: (t: ThemeName) => void
  // "Data sources used" footer — global on/off + per-user collapse default.
  // Both persist to localStorage so user preferences carry across sessions.
  dataSourcesFooterEnabled: boolean
  setDataSourcesFooterEnabled: (v: boolean) => void
  dataSourcesFooterCollapsed: boolean
  setDataSourcesFooterCollapsed: (v: boolean) => void
}

const Ctx = createContext<WorkspaceCtx>({} as WorkspaceCtx)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [nav, setNavState] = useState<NavItem[]>(DEFAULT_NAV)
  const [topbar, setTopbarState] = useState<TopbarItem[]>(DEFAULT_TOPBAR)
  const [layouts, setLayouts] = useState<PageLayouts>(DEFAULT_PAGE_LAYOUTS)
  const [editMode, setEditMode] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerPage, setPickerPage] = useState('')
  const [screenerPresets, setScreenerPresets] = useState<ScreenerPreset[]>([])
  const [theme, setThemeState] = useState<ThemeName>('white')
  // "Data sources used" footer settings — global on by default, per-user
  // collapse defaults to expanded.
  const [dataSourcesFooterEnabled, setDsfEnabledState] = useState<boolean>(true)
  const [dataSourcesFooterCollapsed, setDsfCollapsedState] = useState<boolean>(false)
  const { isLoaded: authLoaded, isSignedIn, userId, orgId } = useAuth()
  const screenerPresetsSynced = Boolean(authLoaded && isSignedIn && orgId)

  // Hydrate from localStorage. For preferences the local cache is purely
  // offline-first — when the user is signed in the API response below
  // overwrites these values with the persisted account-level preference.
  useEffect(() => {
    try {
      const sn = localStorage.getItem('finsyt-nav'); if (sn) setNavState(JSON.parse(sn))
      const st = localStorage.getItem('finsyt-topbar'); if (st) setTopbarState(JSON.parse(st))
      const sl = localStorage.getItem('finsyt-layouts'); if (sl) setLayouts(JSON.parse(sl))
      // Local presets only seed state when there is no active workspace —
      // the API takes over for signed-in org members in the effect below.
      const sp = localStorage.getItem('finsyt-screener-presets')
      if (sp) {
        const parsed = JSON.parse(sp)
        if (Array.isArray(parsed)) setScreenerPresets(parsed)
      }
      const stheme = localStorage.getItem('finsyt-theme') as ThemeName | null
      if (stheme && ['white','cream','gray','dark'].includes(stheme)) {
        setThemeState(stheme)
      }
      const dsfe = localStorage.getItem('finsyt-data-sources-footer')
      if (dsfe === '0' || dsfe === 'false') setDsfEnabledState(false)
      const dsfc = localStorage.getItem('finsyt-data-sources-footer-collapsed')
      if (dsfc === '1' || dsfc === 'true') setDsfCollapsedState(true)
    } catch {}
  }, [])

  // When signed in, the user's account record is the source of truth for the
  // transparency toggles — fetch and overwrite the local cache so an analyst
  // who switches laptops or clears site data still sees their preference.
  // The localStorage write keeps the cache in sync so the next reload
  // hydrates from the same value before the API responds.
  useEffect(() => {
    if (!authLoaded || !isSignedIn || !userId) return
    let cancelled = false
    fetch('/api/user/preferences', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { preferences?: { dataSourcesFooterEnabled?: boolean; dataSourcesFooterCollapsed?: boolean } }) => {
        if (cancelled || !data.preferences) return
        const enabled = data.preferences.dataSourcesFooterEnabled
        const collapsed = data.preferences.dataSourcesFooterCollapsed
        if (typeof enabled === 'boolean') {
          setDsfEnabledState(enabled)
          try { localStorage.setItem('finsyt-data-sources-footer', enabled ? '1' : '0') } catch {}
        }
        if (typeof collapsed === 'boolean') {
          setDsfCollapsedState(collapsed)
          try { localStorage.setItem('finsyt-data-sources-footer-collapsed', collapsed ? '1' : '0') } catch {}
        }
      })
      .catch(() => { /* keep last-known cache on transient failure */ })
    return () => { cancelled = true }
  }, [authLoaded, isSignedIn, userId])

  // Apply theme to <html data-theme="..."> whenever it changes.
  // Always apply the data-theme attribute. White is the default; the bare
  // :root tokens are dark (terminal mode) and only used when explicitly opted in.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t)
    try { localStorage.setItem('finsyt-theme', t) } catch {}
  }, [])

  // Persist transparency toggles to the user's account so the preference
  // follows them across browsers, devices and incognito sessions. localStorage
  // remains the offline-first cache (and sole store for signed-out users);
  // API failures are non-fatal so a flaky network never blocks a UI toggle.
  const persistPrefsToApi = useCallback(
    (body: { dataSourcesFooterEnabled?: boolean; dataSourcesFooterCollapsed?: boolean }) => {
      if (!authLoaded || !isSignedIn || !userId) return
      fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      }).catch(() => { /* localStorage already holds the latest value */ })
    },
    [authLoaded, isSignedIn, userId],
  )

  const setDataSourcesFooterEnabled = useCallback((v: boolean) => {
    setDsfEnabledState(v)
    try { localStorage.setItem('finsyt-data-sources-footer', v ? '1' : '0') } catch {}
    persistPrefsToApi({ dataSourcesFooterEnabled: v })
  }, [persistPrefsToApi])
  const setDataSourcesFooterCollapsed = useCallback((v: boolean) => {
    setDsfCollapsedState(v)
    try { localStorage.setItem('finsyt-data-sources-footer-collapsed', v ? '1' : '0') } catch {}
    persistPrefsToApi({ dataSourcesFooterCollapsed: v })
  }, [persistPrefsToApi])

  const setNav = useCallback((n: NavItem[]) => {
    setNavState(n); localStorage.setItem('finsyt-nav', JSON.stringify(n))
  }, [])
  const setTopbar = useCallback((t: TopbarItem[]) => {
    setTopbarState(t); localStorage.setItem('finsyt-topbar', JSON.stringify(t))
  }, [])
  const setLayout = useCallback((page: string, widgets: PlacedWidget[]) => {
    setLayouts(prev => {
      const next = { ...prev, [page]: widgets }
      localStorage.setItem('finsyt-layouts', JSON.stringify(next))
      return next
    })
  }, [])

  const openPicker = useCallback((page: string) => { setPickerPage(page); setPickerOpen(true) }, [])
  const closePicker = useCallback(() => setPickerOpen(false), [])

  const addWidget = useCallback((page: string, widgetId: string) => {
    setLayouts(prev => {
      const existing = prev[page] || []
      const newWidget: PlacedWidget = {
        id: `w-${widgetId}-${Date.now()}`,
        widgetId,
        order: existing.length,
      }
      const next = { ...prev, [page]: [...existing, newWidget] }
      localStorage.setItem('finsyt-layouts', JSON.stringify(next))
      return next
    })
  }, [])

  const removeWidget = useCallback((page: string, instanceId: string) => {
    setLayouts(prev => {
      const next = { ...prev, [page]: (prev[page] || []).filter(w => w.id !== instanceId) }
      localStorage.setItem('finsyt-layouts', JSON.stringify(next))
      return next
    })
  }, [])

  const reorderWidgets = useCallback((page: string, widgets: PlacedWidget[]) => {
    setLayouts(prev => {
      const next = { ...prev, [page]: widgets }
      localStorage.setItem('finsyt-layouts', JSON.stringify(next))
      return next
    })
  }, [])

  // When the user is signed in to a workspace, the API is the source of
  // truth — fetch the org-scoped list (own + shared) and replace the local
  // cache. Re-runs whenever the active org changes.
  useEffect(() => {
    if (!screenerPresetsSynced) return
    let cancelled = false
    fetch('/api/screener/presets', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { presets?: ApiPreset[] }) => {
        if (cancelled || !Array.isArray(data.presets)) return
        setScreenerPresets(data.presets.map(p => fromApi(p, userId)))
      })
      .catch(() => { /* keep last-known list on transient failure */ })
    return () => { cancelled = true }
  }, [screenerPresetsSynced, orgId, userId])

  const saveScreenerPreset = useCallback(
    async (name: string, filters: Record<string, unknown>, opts?: { shared?: boolean }): Promise<ScreenerPreset> => {
      const trimmed = name.trim().slice(0, 60) || 'Untitled preset'
      if (screenerPresetsSynced) {
        const res = await fetch('/api/screener/presets', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ name: trimmed, filters, shared: opts?.shared ?? false }),
        })
        if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to save preset'))
        const { preset } = (await res.json()) as { preset: ApiPreset }
        const created = fromApi(preset, userId)
        setScreenerPresets(prev => [created, ...prev.filter(p => p.id !== created.id)])
        return created
      }
      // Anonymous / orgless fallback — local-only.
      const preset: ScreenerPreset = {
        id: `sp-local-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`,
        name: trimmed,
        filters,
        createdAt: Date.now(),
        ownedByMe: true,
      }
      setScreenerPresets(prev => {
        const next = [preset, ...prev].slice(0, 50)
        try { localStorage.setItem('finsyt-screener-presets', JSON.stringify(next)) } catch {}
        return next
      })
      return preset
    },
    [screenerPresetsSynced, userId],
  )

  const deleteScreenerPreset = useCallback(async (id: string): Promise<void> => {
    if (screenerPresetsSynced && !id.startsWith('sp-local-')) {
      const res = await fetch(`/api/screener/presets/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!res.ok && res.status !== 404) throw new Error(await readErrorMessage(res, 'Failed to delete preset'))
      setScreenerPresets(prev => prev.filter(p => p.id !== id))
      return
    }
    setScreenerPresets(prev => {
      const next = prev.filter(p => p.id !== id)
      try { localStorage.setItem('finsyt-screener-presets', JSON.stringify(next)) } catch {}
      return next
    })
  }, [screenerPresetsSynced])

  // Shared PATCH helper for rename/update against the org-scoped API.
  // Mirrors the save/delete pattern: API is source of truth for synced
  // (signed-in + org) presets; otherwise falls back to localStorage.
  const patchScreenerPreset = useCallback(
    async (id: string, body: { name?: string; filters?: Record<string, unknown> }): Promise<void> => {
      const isLocal = id.startsWith('sp-local-')
      if (screenerPresetsSynced && !isLocal) {
        const res = await fetch(`/api/screener/presets/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to update preset'))
        const { preset } = (await res.json()) as { preset: ApiPreset }
        const updated = fromApi(preset, userId)
        setScreenerPresets(prev => prev.map(p => p.id === id ? updated : p))
        return
      }
      setScreenerPresets(prev => {
        const next = prev.map(p => p.id === id ? { ...p, ...body } : p)
        try { localStorage.setItem('finsyt-screener-presets', JSON.stringify(next)) } catch {}
        return next
      })
    },
    [screenerPresetsSynced, userId],
  )

  const renameScreenerPreset = useCallback(async (id: string, name: string): Promise<void> => {
    const trimmed = name.trim().slice(0, 60)
    if (!trimmed) return
    await patchScreenerPreset(id, { name: trimmed })
  }, [patchScreenerPreset])

  const updateScreenerPreset = useCallback(async (id: string, filters: Record<string, unknown>): Promise<void> => {
    await patchScreenerPreset(id, { filters })
  }, [patchScreenerPreset])

  return (
    <Ctx.Provider value={{ nav, setNav, topbar, setTopbar, layouts, setLayout, editMode, setEditMode, pickerOpen, pickerPage, openPicker, closePicker, addWidget, removeWidget, reorderWidgets, screenerPresets, screenerPresetsSynced, saveScreenerPreset, deleteScreenerPreset, renameScreenerPreset, updateScreenerPreset, theme, setTheme, dataSourcesFooterEnabled, setDataSourcesFooterEnabled, dataSourcesFooterCollapsed, setDataSourcesFooterCollapsed }}>
      {children}
    </Ctx.Provider>
  )
}

export function useWorkspace() { return useContext(Ctx) }

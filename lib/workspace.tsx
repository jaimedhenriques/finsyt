'use client'
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'

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
  { id:'overview',   href:'/app',           labelKey:'overview',    iconKey:'overview',    visible:true,  pinned:true },
  { id:'watchlist',  href:'/app/watchlist', labelKey:'watchlist',   iconKey:'watchlist',   visible:true },
  { id:'alerts',     href:'/app/alerts',    labelKey:'alerts',      iconKey:'alerts',      badge:'3', visible:true },
  { id:'workspaces', href:'/app/workspaces', labelKey:'workspaces', iconKey:'workspaces', visible:true },
  { id:'formulas',    href:'/app/formulas',    labelKey:'formulas',    iconKey:'formulas',    visible:true },
  { id:'research',   href:'/app/research',  labelKey:'ai_research', iconKey:'ai_research', visible:true },
  { id:'screener',   href:'/app/screener',  labelKey:'screener',    iconKey:'screener',    visible:true },
  { id:'news',       href:'/app/news',      labelKey:'news_signals',iconKey:'news_signals',visible:true },
  { id:'filings',    href:'/app/filings',   labelKey:'filings',     iconKey:'filings',     visible:true },
  { id:'markets',    href:'/app/markets',   labelKey:'markets',     iconKey:'markets',     visible:true },
  { id:'deals',      href:'/app/deals',     labelKey:'deals',       iconKey:'deals',       visible:false },
  { id:'private',    href:'/app/private',   labelKey:'private',     iconKey:'private',     visible:true },
  { id:'discovery',  href:'/app/discovery', labelKey:'discovery',   iconKey:'discovery',   visible:true },
  { id:'macro',      href:'/app/macro',     labelKey:'macro',       iconKey:'macro',       visible:true },
  { id:'widgets',    href:'/app/widgets',   labelKey:'widgets',     iconKey:'widgets',     visible:true },
  { id:'developer',  href:'/app/developer', labelKey:'developer',   iconKey:'developer',   visible:true },
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
}

const Ctx = createContext<WorkspaceCtx>({} as WorkspaceCtx)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [nav, setNavState] = useState<NavItem[]>(DEFAULT_NAV)
  const [topbar, setTopbarState] = useState<TopbarItem[]>(DEFAULT_TOPBAR)
  const [layouts, setLayouts] = useState<PageLayouts>(DEFAULT_PAGE_LAYOUTS)
  const [editMode, setEditMode] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerPage, setPickerPage] = useState('')

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const sn = localStorage.getItem('finsyt-nav'); if (sn) setNavState(JSON.parse(sn))
      const st = localStorage.getItem('finsyt-topbar'); if (st) setTopbarState(JSON.parse(st))
      const sl = localStorage.getItem('finsyt-layouts'); if (sl) setLayouts(JSON.parse(sl))
    } catch {}
  }, [])

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

  return (
    <Ctx.Provider value={{ nav, setNav, topbar, setTopbar, layouts, setLayout, editMode, setEditMode, pickerOpen, pickerPage, openPicker, closePicker, addWidget, removeWidget, reorderWidgets }}>
      {children}
    </Ctx.Provider>
  )
}

export function useWorkspace() { return useContext(Ctx) }

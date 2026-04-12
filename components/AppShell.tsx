'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import NavCustomiser from '@/components/NavCustomiser'
import WidgetPicker from '@/components/WidgetPicker'
import { useLocale } from '@/lib/i18n/LocaleContext'
import { LOCALES, t } from '@/lib/i18n/translations'
import { useWorkspace } from '@/lib/workspace'

const SIDEBAR_W = 250
const SIDEBAR_COLLAPSED_W = 72

type SearchResult = {
  symbol: string
  name: string
}

type CommandEntry = {
  id: string
  title: string
  subtitle: string
  href: string
  hotkey?: string
}

const MARKET_TICKERS = [
  { label: 'S&P 500', value: '5,241.6', change: '+0.58%' },
  { label: 'NASDAQ', value: '16,434.2', change: '+0.76%' },
  { label: '10Y UST', value: '4.22%', change: '-0.04' },
]

const NAV_ICONS: Record<string, React.ReactNode> = {
  overview: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  watchlist: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
  alerts: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  formulas: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 9h6" />
      <path d="M9 12h6" />
      <path d="M9 15h4" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  ),
  workspaces: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  ai_research: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  ),
  screener: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  ),
  news_signals: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2z" />
      <path d="M4 2v14" />
    </svg>
  ),
  filings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  markets: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  deals: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  private: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  discovery: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
      <path d="M8 11h6M11 8v6" />
    </svg>
  ),
  widgets: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <path d="M3 17l4 4L14 8" />
    </svg>
  ),
  developer: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  figma: (
    <svg width="16" height="16" viewBox="0 0 38 57" fill="currentColor">
      <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
      <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
      <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
      <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
      <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
    </svg>
  ),
  macro: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
}

function PanelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  )
}

function LangPicker() {
  const { locale, setLocale } = useLocale()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = LOCALES.find((item) => item.code === locale) ?? LOCALES[0]

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          background: '#F8FAFF',
          border: '1px solid #DFE6F4',
          borderRadius: 10,
          cursor: 'pointer',
          fontSize: 11.5,
          fontWeight: 700,
          color: '#33466B',
          fontFamily: 'inherit',
        }}
      >
        <span>{current.flag}</span>
        <span>{current.code.toUpperCase()}</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            minWidth: 176,
            borderRadius: 12,
            background: '#fff',
            border: '1px solid #DCE4F3',
            boxShadow: '0 18px 34px rgba(21,35,75,0.16)',
            overflow: 'hidden',
            zIndex: 110,
          }}
        >
          {LOCALES.map((item) => {
            const active = item.code === locale
            return (
              <button
                key={item.code}
                onClick={() => {
                  setLocale(item.code)
                  setOpen(false)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  border: 'none',
                  cursor: 'pointer',
                  background: active ? '#EDF3FF' : '#fff',
                  color: active ? '#1B4FFF' : '#273A62',
                  fontFamily: 'inherit',
                  fontWeight: active ? 700 : 500,
                  fontSize: 12.5,
                  padding: '8px 12px',
                }}
              >
                <span>{item.flag}</span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TopTickerStrip() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 10,
        border: '1px solid #E2E8F4',
        background: '#fff',
      }}
    >
      {MARKET_TICKERS.map((ticker) => {
        const positive = ticker.change.startsWith('+')
        return (
          <div
            key={ticker.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10.5,
              color: '#52638A',
              padding: '2px 6px',
              borderRadius: 8,
              background: '#F8FAFF',
            }}
          >
            <span style={{ fontWeight: 700, color: '#2A3E67' }}>{ticker.label}</span>
            <span style={{ fontWeight: 700, color: '#0F1F43' }}>{ticker.value}</span>
            <span style={{ fontWeight: 700, color: positive ? '#0D9F68' : '#D03054' }}>{ticker.change}</span>
          </div>
        )
      })}
    </div>
  )
}

function ShortcutChip({ text }: { text: string }) {
  return (
    <span
      style={{
        borderRadius: 6,
        border: '1px solid #D8E2F0',
        background: '#F7FAFF',
        color: '#496089',
        fontSize: 10.5,
        fontWeight: 700,
        padding: '2px 6px',
        lineHeight: 1.35,
      }}
    >
      {text}
    </span>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { locale } = useLocale()
  const { nav, topbar, editMode, setEditMode, openPicker } = useWorkspace()
  const tr = (key: string) => t(locale, key)

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-collapsed') === 'true'
  })
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [showNavCustomiser, setShowNavCustomiser] = useState(false)
  const paletteInputRef = useRef<HTMLInputElement>(null)

  const sidebarW = collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_W
  const visibleNav = nav.filter((item) => item.visible || item.pinned)

  const navSections = useMemo(
    () => [
      { key: null, ids: ['research'] },
      { key: 'markets', ids: ['watchlist', 'screener', 'news', 'filings', 'markets'] },
      { key: 'intelligence', ids: ['private', 'discovery', 'macro', 'deals'] },
      { key: 'tools', ids: ['formulas', 'workspaces', 'alerts', 'widgets', 'developer', 'figma'] },
    ],
    [],
  )

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar-collapsed', String(!prev))
      return !prev
    })
  }

  const handleSearch = async (query: string) => {
    setSearch(query)
    if (query.length < 2) {
      setSearchResults([])
      return
    }
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      const data = await response.json()
      const nextResults = Array.isArray(data.results) ? data.results : []
      setSearchResults(
        nextResults
          .filter((result): result is SearchResult => Boolean(result?.symbol && result?.name))
          .slice(0, 8),
      )
    } catch {
      setSearchResults([])
    }
  }

  const commands = useMemo<CommandEntry[]>(
    () => [
      { id: 'cmd-research', title: 'Open AI Research', subtitle: 'Ask grounded questions across sources', href: '/app/research', hotkey: 'R' },
      { id: 'cmd-workspaces', title: 'Open Workspaces', subtitle: 'Source management and Studio outputs', href: '/app/workspaces', hotkey: 'W' },
      { id: 'cmd-watchlist', title: 'Open Watchlist', subtitle: 'Track live symbols and key metrics', href: '/app/watchlist', hotkey: 'L' },
      { id: 'cmd-alerts', title: 'Open Alerts', subtitle: 'Price and signal alert monitoring', href: '/app/alerts', hotkey: 'A' },
      { id: 'cmd-screener', title: 'Open Screener', subtitle: 'Filter investable opportunities', href: '/app/screener', hotkey: 'S' },
      { id: 'cmd-news', title: 'Open News & Signals', subtitle: 'Track market-moving developments', href: '/app/news', hotkey: 'N' },
      { id: 'cmd-private', title: 'Open Private Markets', subtitle: 'Private company intelligence and trends', href: '/app/private', hotkey: 'P' },
      { id: 'cmd-settings', title: 'Open Settings', subtitle: 'Workspace controls and preferences', href: '/app/settings', hotkey: ',' },
    ],
    [],
  )

  const filteredCommands = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase()
    if (!query) return commands
    return commands.filter((command) =>
      `${command.title} ${command.subtitle} ${command.href}`.toLowerCase().includes(query),
    )
  }, [commands, paletteQuery])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isModK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      if (isModK) {
        event.preventDefault()
        setPaletteOpen((prev) => {
          const next = !prev
          if (next) {
            setPaletteIndex(0)
            setPaletteQuery('')
          }
          return next
        })
        return
      }
      if (!paletteOpen) return
      if (event.key === 'Escape') {
        setPaletteOpen(false)
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setPaletteIndex((prev) => Math.min(prev + 1, Math.max(filteredCommands.length - 1, 0)))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setPaletteIndex((prev) => Math.max(prev - 1, 0))
        return
      }
      if (event.key === 'Enter' && filteredCommands.length > 0) {
        event.preventDefault()
        const target = filteredCommands[Math.min(paletteIndex, filteredCommands.length - 1)]
        if (target) {
          router.push(target.href)
          setPaletteOpen(false)
          setPaletteQuery('')
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filteredCommands, paletteIndex, paletteOpen, router])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#EEF2F9' }}>
      <aside
        style={{
          width: sidebarW,
          minWidth: sidebarW,
          background:
            'linear-gradient(180deg, #081228 0%, #0A162F 45%, #081124 100%)',
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 40,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width 0.24s cubic-bezier(0.4,0,0.2,1)',
          borderRight: '1px solid rgba(156,173,211,0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            padding: collapsed ? 0 : '0 1rem',
            height: 66,
            borderBottom: '1px solid rgba(149,168,207,0.18)',
            flexShrink: 0,
          }}
        >
          {!collapsed && (
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 12,
                }}
              >
                F
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 14.5, letterSpacing: '-0.02em' }}>Finsyt</div>
                <div style={{ color: 'rgba(156,184,255,0.75)', fontSize: 10, fontWeight: 600 }}>Intelligence Platform</div>
              </div>
            </Link>
          )}
          {collapsed && (
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              F
            </div>
          )}
          {!collapsed && (
            <button
              onClick={toggleSidebar}
              style={{ background: 'transparent', border: 'none', color: 'rgba(188,205,243,0.7)', cursor: 'pointer' }}
            >
              <PanelIcon />
            </button>
          )}
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '0.8rem 0' : '0.9rem 0.65rem' }}>
          {navSections.map((section, sectionIndex) => {
            const sectionItems = visibleNav.filter((item) => section.ids.includes(item.id))
            if (!sectionItems.length) return null
            return (
              <div key={sectionIndex} style={{ marginBottom: 8 }}>
                {section.key && !collapsed && (
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'rgba(162,178,212,0.52)',
                      padding: '8px 10px 4px',
                    }}
                  >
                    {tr(section.key)}
                  </div>
                )}
                {section.key && collapsed && (
                  <div style={{ height: 1, background: 'rgba(162,178,212,0.28)', margin: '10px 14px' }} />
                )}
                {sectionItems.map((item) => {
                  const active = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href))
                  const label = tr(item.labelKey)

                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      title={collapsed ? label : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        color: active ? '#E9F0FF' : 'rgba(196,212,246,0.76)',
                        textDecoration: 'none',
                        borderRadius: collapsed ? 0 : 10,
                        fontSize: 13,
                        fontWeight: active ? 700 : 500,
                        padding: collapsed ? '10px 0' : '9px 10px',
                        marginBottom: 2,
                        background: active
                          ? 'linear-gradient(90deg, rgba(39,95,255,0.4) 0%, rgba(39,95,255,0.16) 100%)'
                          : 'transparent',
                        border: active ? '1px solid rgba(117,152,255,0.35)' : '1px solid transparent',
                        transition: 'all 0.15s',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ color: active ? '#C9DAFF' : 'rgba(196,212,246,0.64)', display: 'flex' }}>
                        {NAV_ICONS[item.iconKey]}
                      </span>
                      {!collapsed && (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                      )}
                      {!collapsed && item.badge && (
                        <span
                          style={{
                            marginLeft: 'auto',
                            borderRadius: 99,
                            padding: '1px 7px',
                            fontSize: 10,
                            fontWeight: 800,
                            color: '#fff',
                            background: '#1B4FFF',
                          }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>

        <div
          style={{
            borderTop: '1px solid rgba(149,168,207,0.18)',
            padding: collapsed ? '0.65rem 0' : '0.65rem 0.65rem',
          }}
        >
          {collapsed && (
            <button
              onClick={toggleSidebar}
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                display: 'flex',
                justifyContent: 'center',
                color: 'rgba(188,205,243,0.75)',
                cursor: 'pointer',
                marginBottom: 8,
              }}
            >
              <PanelIcon />
            </button>
          )}
          {!collapsed && (
            <button
              onClick={() => setShowNavCustomiser(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                border: '1px solid rgba(147,171,224,0.24)',
                borderRadius: 10,
                background: 'rgba(14,31,61,0.72)',
                color: 'rgba(210,225,255,0.92)',
                fontWeight: 600,
                fontFamily: 'inherit',
                padding: '8px 10px',
                fontSize: 12.5,
                marginBottom: 6,
                cursor: 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="8" y1="12" x2="16" y2="12" />
                <line x1="11" y1="18" x2="13" y2="18" />
              </svg>
              Customise menu
            </button>
          )}
          <Link
            href="/app/settings"
            title={collapsed ? tr('settings') : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 10,
              textDecoration: 'none',
              borderRadius: collapsed ? 0 : 10,
              padding: collapsed ? '10px 0' : '9px 10px',
              color: pathname === '/app/settings' ? '#E9F0FF' : 'rgba(196,212,246,0.8)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {NAV_ICONS.settings}
            {!collapsed && <span>{tr('settings')}</span>}
          </Link>
        </div>
      </aside>

      <div
        style={{
          marginLeft: sidebarW,
          flex: 1,
          minHeight: '100vh',
          transition: 'margin-left 0.24s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            height: 72,
            background: 'rgba(242,246,253,0.92)',
            borderBottom: '1px solid #DDE6F2',
            display: 'flex',
            alignItems: 'center',
            padding: '0 1.1rem',
            position: 'sticky',
            top: 0,
            zIndex: 30,
            gap: 10,
            backdropFilter: 'blur(10px)',
          }}
        >
          {topbar.find((item) => item.id === 'search')?.visible !== false && (
            <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
              <svg
                style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9AB0D3', pointerEvents: 'none' }}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                className="input"
                placeholder={tr('search_placeholder')}
                value={search}
                onChange={(event) => handleSearch(event.target.value)}
                onBlur={() => setTimeout(() => setSearchResults([]), 180)}
                style={{
                  background: '#fff',
                  border: '1px solid #DBE4F1',
                  height: 40,
                  paddingLeft: '2.05rem',
                  fontSize: 13,
                  borderRadius: 11,
                  boxShadow: '0 1px 0 rgba(14,31,61,0.03)',
                }}
              />
              {searchResults.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    marginTop: 6,
                    left: 0,
                    right: 0,
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '1px solid #D8E2F1',
                    boxShadow: '0 20px 32px rgba(17,34,73,0.14)',
                    background: '#fff',
                    zIndex: 80,
                  }}
                >
                  {searchResults.map((result, index) => (
                    <button
                      key={`${result.symbol}-${index}`}
                      onClick={() => {
                        router.push(`/app/company/${result.symbol}`)
                        setSearch('')
                        setSearchResults([])
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        cursor: 'pointer',
                        background: '#fff',
                        padding: '9px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        borderBottom: index < searchResults.length - 1 ? '1px solid #EDF2FA' : 'none',
                      }}
                    >
                      <span style={{ width: 58, fontWeight: 800, color: '#1B4FFF', fontSize: 11.5 }}>{result.symbol}</span>
                      <span style={{ color: '#2E436D', fontSize: 12.5 }}>{result.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => {
              setPaletteIndex(0)
              setPaletteQuery('')
              setPaletteOpen(true)
              window.setTimeout(() => {
                paletteInputRef.current?.focus()
                paletteInputRef.current?.select()
              }, 30)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 10,
              border: '1px solid #D9E3F1',
              background: '#fff',
              color: '#5A7095',
              padding: '6px 10px',
              fontFamily: 'inherit',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Quick actions
            <span style={{ color: '#8AA0C5', fontWeight: 700 }}>⌘/Ctrl + K</span>
          </button>

          {topbar.find((item) => item.id === 'indices')?.visible !== false && <TopTickerStrip />}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setEditMode(!editMode)}
              style={{
                borderRadius: 10,
                border: `1px solid ${editMode ? '#184AE0' : '#D9E3F1'}`,
                background: editMode ? '#1B4FFF' : '#fff',
                color: editMode ? '#fff' : '#31476F',
                fontFamily: 'inherit',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 11px',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              {editMode ? 'Done' : 'Customise'}
            </button>

            {editMode && (
              <button
                onClick={() => openPicker(pathname)}
                style={{
                  borderRadius: 10,
                  border: '1px solid #BFD1F8',
                  background: '#EDF3FF',
                  color: '#1B4FFF',
                  fontFamily: 'inherit',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '8px 11px',
                }}
              >
                + Add Widget
              </button>
            )}

            {topbar.find((item) => item.id === 'language')?.visible !== false && <LangPicker />}

            {topbar.find((item) => item.id === 'live_dot')?.visible !== false && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: '1px solid #D9E4F2',
                  background: '#fff',
                  borderRadius: 10,
                  padding: '6px 9px',
                  color: '#4D637F',
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
                {tr('live')}
              </div>
            )}

            {topbar.find((item) => item.id === 'alerts')?.visible !== false && (
              <Link
                href="/app/alerts"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: '1px solid #D9E4F2',
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#31476F',
                  textDecoration: 'none',
                  position: 'relative',
                }}
              >
                {NAV_ICONS.alerts}
                <span
                  style={{
                    position: 'absolute',
                    right: 4,
                    top: 5,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#1B4FFF',
                    border: '2px solid #fff',
                  }}
                />
              </Link>
            )}

            {topbar.find((item) => item.id === 'avatar')?.visible !== false && (
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                J
              </div>
            )}
          </div>
        </header>

        <main style={{ flex: 1, minHeight: 0 }}>{children}</main>
      </div>

      {showNavCustomiser && <NavCustomiser onClose={() => setShowNavCustomiser(false)} />}
      <WidgetPicker />
      {paletteOpen && (
        <div
          onClick={() => {
            setPaletteOpen(false)
            setPaletteQuery('')
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(8,18,40,0.34)',
            backdropFilter: 'blur(4px)',
            zIndex: 120,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            paddingTop: '10vh',
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(680px, 92vw)',
              borderRadius: 16,
              border: '1px solid #D6E0F1',
              background: '#fff',
              boxShadow: '0 30px 60px rgba(16,35,71,0.3)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #E5ECF7' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  ref={paletteInputRef}
                  value={paletteQuery}
                  onChange={(event) => setPaletteQuery(event.target.value)}
                  placeholder="Search pages, actions, and destinations..."
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    color: '#1F3358',
                  }}
                />
                <ShortcutChip text="Esc" />
              </div>
            </div>
            <div style={{ maxHeight: 370, overflowY: 'auto', padding: 8 }}>
              {filteredCommands.length ? (
                filteredCommands.map((command, index) => {
                  const active = index === paletteIndex
                  return (
                    <button
                      key={command.id}
                      onMouseEnter={() => setPaletteIndex(index)}
                      onClick={() => {
                        router.push(command.href)
                        setPaletteOpen(false)
                        setPaletteQuery('')
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        border: 'none',
                        cursor: 'pointer',
                        borderRadius: 10,
                        background: active ? '#EDF3FF' : '#fff',
                        padding: '10px 11px',
                        textAlign: 'left',
                      }}
                    >
                      <div>
                        <div style={{ color: '#1E335A', fontWeight: 700, fontSize: 13 }}>{command.title}</div>
                        <div style={{ color: '#6A7FA2', fontSize: 11.5 }}>{command.subtitle}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#87A0C8', fontSize: 11.5 }}>{command.href}</span>
                        {command.hotkey ? <ShortcutChip text={command.hotkey} /> : null}
                      </div>
                    </button>
                  )
                })
              ) : (
                <div style={{ padding: '26px 14px', textAlign: 'center', color: '#7A8EAE', fontSize: 12.5 }}>
                  No matching actions. Try “research”, “watchlist”, or “alerts”.
                </div>
              )}
            </div>
            <div
              style={{
                borderTop: '1px solid #E5ECF7',
                background: '#FAFCFF',
                padding: '9px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#7188AD',
                fontSize: 11.5,
              }}
            >
              <span>Navigate faster with keyboard-first actions.</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShortcutChip text="↑ ↓" />
                <ShortcutChip text="Enter" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

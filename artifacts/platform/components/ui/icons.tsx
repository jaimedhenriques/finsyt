'use client'
/**
 * Lucide icon constants for the Finsyt platform.
 *
 * Centralising icon imports does three things:
 *   1. Forces a consistent visual scale (size + stroke) across every surface.
 *   2. Replaces the legacy emoji-glyph nav with named Lucide icons.
 *   3. Makes future icon swaps a one-line change.
 */
import {
  LayoutDashboard, Star, Briefcase, Bell,
  Sparkles, Bot, Inbox, Plus,
  Telescope, Grid3x3, FolderKanban, Calculator, Filter, Activity, Newspaper, CalendarDays, MessageSquareQuote, FileText, Crosshair, Users2,
  ClipboardList, Mail,
  TrendingUp, Handshake, Globe2, Building2,
  Code2, Hexagon, BookOpen,
  ShieldCheck, ServerCog, Settings,
  Search, Send, Command, ArrowUpRight, ArrowRight,
  X, ChevronLeft, ChevronRight, ChevronDown,
  Loader2, Check, AlertTriangle, RotateCcw, Pin, Copy, ExternalLink, Download,
  Wand2, ListChecks, Library, History, Boxes, Plug,
  type LucideIcon,
} from 'lucide-react'

export const ICON_STROKE = 1.75
export const ICON_SIZE_SM = 14
export const ICON_SIZE_MD = 16
export const ICON_SIZE_LG = 20

// ── Sidebar / nav icon registry ────────────────────────────────────────────
// Pages reference icons by key so renames stay in this one file.
export const NAV_ICONS = {
  overview: LayoutDashboard,
  watchlist: Star,
  portfolio: Briefcase,
  alerts: Bell,
  agentLibrary: Library,
  agents: Bot,
  inbox: Inbox,
  research: Sparkles,
  matrix: Grid3x3,
  workspaces: FolderKanban,
  peers: Users2,
  models: Calculator,
  valuations: Crosshair,
  screener: Filter,
  signals: Activity,
  news: Newspaper,
  calendar: CalendarDays,
  questions: MessageSquareQuote,
  filings: FileText,
  markets: TrendingUp,
  deals: Handshake,
  macro: Globe2,
  discovery: Building2,
  developer: Code2,
  mcp: Hexagon,
  connectors: Plug,
  docs: BookOpen,
  audit: ShieldCheck,
  providers: ServerCog,
  settings: Settings,
  formulas: Calculator,
  widgets: Boxes,
  company: Building2,
  blueprint: ClipboardList,
  outreach: Mail,
} as const

export type NavIconKey = keyof typeof NAV_ICONS

// ── Action icon registry (topbar, command surface, page actions) ────────────
export const ACTION_ICONS = {
  search: Search,
  send: Send,
  command: Command,
  sparkles: Sparkles,
  plus: Plus,
  arrowUpRight: ArrowUpRight,
  arrowRight: ArrowRight,
  close: X,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  loader: Loader2,
  check: Check,
  warn: AlertTriangle,
  reset: RotateCcw,
  pin: Pin,
  copy: Copy,
  externalLink: ExternalLink,
  download: Download,
  wand: Wand2,
  list: ListChecks,
  bot: Bot,
  history: History,
  bell: Bell,
  inbox: Inbox,
  telescope: Telescope,
} as const

export type { LucideIcon }

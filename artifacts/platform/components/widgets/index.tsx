'use client'
/* ──────────────────────────────────────────────────────────────────────────
   Widget registry. Maps every WIDGET_CATALOGUE id (lib/workspace.tsx) to its
   live React component. All components pull real data from platform endpoints
   and surface `source` attribution — see ./overview-widgets.tsx.
   ────────────────────────────────────────────────────────────────────────── */
import type { ComponentType } from 'react'
import {
  AiQuickAskWidget,
  WhatChangedWidget,
  AgentsFeedWidget,
  ActivityFeedWidget,
  IndicesWidget,
  MarketMoversWidget,
  MacroSnapshotWidget,
  LiveNowWidget,
  WatchlistCoverageWidget,
  WatchlistRailWidget,
  PriceMonitorWidget,
  PortfolioSummaryWidget,
  NewsFeedWidget,
  EarningsAheadWidget,
  ConnectSourcesWidget,
  QuickAccessWidget,
} from './overview-widgets'

export const WIDGET_REGISTRY: Record<string, ComponentType> = {
  // AI & Agents
  ai_quick_ask:       AiQuickAskWidget,
  what_changed:       WhatChangedWidget,
  agents_feed:        AgentsFeedWidget,
  activity_feed:      ActivityFeedWidget,
  // Markets
  indices:            IndicesWidget,
  top_movers:         MarketMoversWidget,
  macro_snapshot:     MacroSnapshotWidget,
  live_now:           LiveNowWidget,
  // Watchlist
  watchlist_coverage: WatchlistCoverageWidget,
  watchlist_rail:     WatchlistRailWidget,
  price_monitor:      PriceMonitorWidget,
  portfolio_summary:  PortfolioSummaryWidget,
  // News
  news_feed:          NewsFeedWidget,
  earnings_ahead:     EarningsAheadWidget,
  // Workspace
  connect_sources:    ConnectSourcesWidget,
  quick_access:       QuickAccessWidget,
}

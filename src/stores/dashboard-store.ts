'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Watchlist types
export interface WatchlistItem {
  symbol: string;
  name: string;
  addedAt: Date;
  alertPrice?: number;
  alertType?: 'above' | 'below';
}

// Report types
export interface SavedReport {
  id: string;
  title: string;
  query: string;
  content: string;
  symbols: string[];
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
}

// History types
export interface QueryHistoryItem {
  id: string;
  query: string;
  response: string;
  timestamp: Date;
  symbols?: string[];
}

// Settings types
export interface UserSettings {
  notifications: {
    priceAlerts: boolean;
    dailyDigest: boolean;
    weeklyReport: boolean;
    marketNews: boolean;
  };
  preferences: {
    defaultView: 'grid' | 'list';
    theme: 'light' | 'dark' | 'system';
    currency: string;
    refreshInterval: number;
  };
  api: {
    enableRealTimeData: boolean;
    dataProvider: 'alpha-vantage' | 'polygon' | 'yahoo';
  };
}

interface DashboardState {
  // Sidebar state
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Watchlist
  watchlist: WatchlistItem[];
  addToWatchlist: (item: Omit<WatchlistItem, 'addedAt'>) => void;
  removeFromWatchlist: (symbol: string) => void;
  updateWatchlistAlert: (symbol: string, alertPrice?: number, alertType?: 'above' | 'below') => void;
  isInWatchlist: (symbol: string) => boolean;

  // Reports
  reports: SavedReport[];
  addReport: (report: Omit<SavedReport, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateReport: (id: string, updates: Partial<SavedReport>) => void;
  deleteReport: (id: string) => void;

  // Query History
  queryHistory: QueryHistoryItem[];
  addToHistory: (item: Omit<QueryHistoryItem, 'id' | 'timestamp'>) => void;
  deleteFromHistory: (id: string) => void;
  clearHistory: () => void;

  // Settings
  settings: UserSettings;
  updateSettings: (updates: Partial<UserSettings>) => void;
  updateNotificationSettings: (updates: Partial<UserSettings['notifications']>) => void;
  updatePreferences: (updates: Partial<UserSettings['preferences']>) => void;
  updateApiSettings: (updates: Partial<UserSettings['api']>) => void;
}

const defaultSettings: UserSettings = {
  notifications: {
    priceAlerts: true,
    dailyDigest: false,
    weeklyReport: true,
    marketNews: true,
  },
  preferences: {
    defaultView: 'grid',
    theme: 'system',
    currency: 'USD',
    refreshInterval: 30,
  },
  api: {
    enableRealTimeData: true,
    dataProvider: 'alpha-vantage',
  },
};

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      // Sidebar state
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      // Watchlist
      watchlist: [],
      addToWatchlist: (item) =>
        set((state) => ({
          watchlist: [
            ...state.watchlist,
            { ...item, addedAt: new Date() },
          ],
        })),
      removeFromWatchlist: (symbol) =>
        set((state) => ({
          watchlist: state.watchlist.filter((item) => item.symbol !== symbol),
        })),
      updateWatchlistAlert: (symbol, alertPrice, alertType) =>
        set((state) => ({
          watchlist: state.watchlist.map((item) =>
            item.symbol === symbol
              ? { ...item, alertPrice, alertType }
              : item
          ),
        })),
      isInWatchlist: (symbol) => get().watchlist.some((item) => item.symbol === symbol),

      // Reports
      reports: [],
      addReport: (report) =>
        set((state) => ({
          reports: [
            {
              ...report,
              id: crypto.randomUUID(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...state.reports,
          ],
        })),
      updateReport: (id, updates) =>
        set((state) => ({
          reports: state.reports.map((report) =>
            report.id === id
              ? { ...report, ...updates, updatedAt: new Date() }
              : report
          ),
        })),
      deleteReport: (id) =>
        set((state) => ({
          reports: state.reports.filter((report) => report.id !== id),
        })),

      // Query History
      queryHistory: [],
      addToHistory: (item) =>
        set((state) => ({
          queryHistory: [
            {
              ...item,
              id: crypto.randomUUID(),
              timestamp: new Date(),
            },
            ...state.queryHistory,
          ].slice(0, 100), // Keep only last 100 items
        })),
      deleteFromHistory: (id) =>
        set((state) => ({
          queryHistory: state.queryHistory.filter((item) => item.id !== id),
        })),
      clearHistory: () => set({ queryHistory: [] }),

      // Settings
      settings: defaultSettings,
      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),
      updateNotificationSettings: (updates) =>
        set((state) => ({
          settings: {
            ...state.settings,
            notifications: { ...state.settings.notifications, ...updates },
          },
        })),
      updatePreferences: (updates) =>
        set((state) => ({
          settings: {
            ...state.settings,
            preferences: { ...state.settings.preferences, ...updates },
          },
        })),
      updateApiSettings: (updates) =>
        set((state) => ({
          settings: {
            ...state.settings,
            api: { ...state.settings.api, ...updates },
          },
        })),
    }),
    {
      name: 'finsyt-dashboard-storage',
      partialize: (state) => ({
        watchlist: state.watchlist,
        reports: state.reports,
        queryHistory: state.queryHistory,
        settings: state.settings,
      }),
    }
  )
);

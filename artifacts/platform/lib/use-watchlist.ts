'use client'
/**
 * useWatchlist — single hook that owns reads, writes, and live refreshes for
 * the user's watchlist. Centralising this here means the Overview, Watchlist
 * page, and command palette all share the same in-memory snapshot and never
 * have to scatter `fetch('/api/watchlist')` calls.
 *
 * Implementation notes
 * --------------------
 *  • The API is intentionally tiny (`{ watchlist: string[] }`) and changes
 *    rarely, so we keep the hook in pure React state with a global event
 *    bus to invalidate other instances on the page.
 *  • `add` / `remove` optimistically mutate the local array before reconciling
 *    with the server response — the surface feels instant even on slow links.
 *  • Polling is opt-in (`pollMs`). Most callers want a one-shot fetch on
 *    mount; the Overview asks for a 60s refresh so coverage stays warm.
 */
import { useCallback, useEffect, useState } from 'react'

const REFRESH_EVENT = 'finsyt:watchlist:refresh'

export type UseWatchlistResult = {
  symbols: string[]
  loading: boolean
  error: string | null
  /** Set when an add was blocked by the plan's watchlist cap (402). */
  upgradeRequired: string | null
  refresh: () => Promise<void>
  add: (symbol: string) => Promise<void>
  remove: (symbol: string) => Promise<void>
}

export function useWatchlist(opts: { pollMs?: number } = {}): UseWatchlistResult {
  const { pollMs } = opts
  const [symbols, setSymbols] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [upgradeRequired, setUpgradeRequired] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res  = await fetch('/api/watchlist', { cache: 'no-store' })
      const data = (await res.json()) as { watchlist?: unknown }
      const next = Array.isArray(data.watchlist)
        ? data.watchlist.filter((s): s is string => typeof s === 'string').map(s => s.toUpperCase())
        : []
      setSymbols(next)
      setError(null)
    } catch (e) {
      setError((e as Error).message || 'Failed to load watchlist')
    } finally {
      setLoading(false)
    }
  }, [])

  const mutate = useCallback(async (symbol: string, action: 'add' | 'remove') => {
    const upper = symbol.toUpperCase()
    if (action === 'add') setUpgradeRequired(null)
    setSymbols(prev =>
      action === 'remove' ? prev.filter(s => s !== upper) : prev.includes(upper) ? prev : [...prev, upper],
    )
    try {
      const res  = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol: upper, action }),
      })
      const data = (await res.json().catch(() => ({}))) as { watchlist?: unknown; message?: unknown }
      if (res.status === 402) {
        // Plan watchlist cap hit — surface an upgrade prompt and revert.
        setUpgradeRequired(
          typeof data.message === 'string'
            ? data.message
            : 'Your plan’s watchlist limit was reached. Upgrade to add more.',
        )
        void refresh()
        return
      }
      if (Array.isArray(data.watchlist)) {
        setSymbols(data.watchlist.filter((s): s is string => typeof s === 'string').map(s => s.toUpperCase()))
      }
      // Notify sibling hook instances so cross-page state stays coherent.
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(REFRESH_EVENT))
    } catch (e) {
      setError((e as Error).message || `Failed to ${action} ${upper}`)
      // Optimistic mutation failed — re-fetch the canonical list.
      void refresh()
    }
  }, [refresh])

  useEffect(() => {
    void refresh()
    const onRefresh = () => { void refresh() }
    if (typeof window !== 'undefined') {
      window.addEventListener(REFRESH_EVENT, onRefresh)
    }
    let id: ReturnType<typeof setInterval> | null = null
    if (pollMs && pollMs > 0) id = setInterval(() => { void refresh() }, pollMs)
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener(REFRESH_EVENT, onRefresh)
      if (id) clearInterval(id)
    }
  }, [refresh, pollMs])

  return {
    symbols,
    loading,
    error,
    upgradeRequired,
    refresh,
    add:    s => mutate(s, 'add'),
    remove: s => mutate(s, 'remove'),
  }
}

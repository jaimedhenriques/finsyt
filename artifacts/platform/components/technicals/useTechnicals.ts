'use client'
/**
 * useTechnicals — fetches raw OHLCV bars for a symbol/range from `/api/aggs`
 * (the same multi-provider waterfall the rest of the platform uses). Indicator
 * values are NOT computed here: the view computes them client-side with the
 * shared `lib/technical-indicators` engine so toggling indicators or tweaking
 * their parameters is instant and never triggers a refetch.
 *
 * `source` attribution is taken straight from the `/api/aggs` response so the
 * chart header can honestly state where the price data came from.
 */
import { useEffect, useRef, useState } from 'react'
import type { Bar } from '@/lib/technical-indicators'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

export type TechnicalsRange = '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | 'MAX'

const RANGE_DAYS: Record<TechnicalsRange, number> = {
  '1M': 31, '3M': 92, '6M': 184, '1Y': 366, '2Y': 731, '5Y': 1827, 'MAX': 3653,
}

export interface UseTechnicalsResult {
  bars: Bar[]
  source: string | null
  loading: boolean
  error: string | null
}

export function useTechnicals(symbol: string, range: TechnicalsRange): UseTechnicalsResult {
  const [bars, setBars] = useState<Bar[]>([])
  const [source, setSource] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reqId = useRef(0)

  useEffect(() => {
    const sym = symbol.toUpperCase().trim()
    if (!sym) return
    const id = ++reqId.current
    setLoading(true)
    setError(null)

    const to = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - RANGE_DAYS[range] * 86400000).toISOString().slice(0, 10)

    fetch(`${BASE}/api/aggs?symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}&timespan=day`)
      .then(async res => {
        const data = await res.json().catch(() => null)
        if (id !== reqId.current) return
        if (!res.ok || !data || !Array.isArray(data.bars) || data.bars.length === 0) {
          setBars([])
          setSource(data?.source ?? null)
          setError(data?.error || 'No price history available for this symbol.')
          setLoading(false)
          return
        }
        const sorted = (data.bars as Bar[])
          .filter(b => b && Number.isFinite(b.c))
          .slice()
          .sort((a, b) => a.t - b.t)
        setBars(sorted)
        setSource(typeof data.source === 'string' ? data.source : null)
        setLoading(false)
      })
      .catch(err => {
        if (id !== reqId.current) return
        setBars([])
        setError((err as Error).message || 'Failed to load price history.')
        setLoading(false)
      })
  }, [symbol, range])

  return { bars, source, loading, error }
}

/** Map a provider key from `/api/aggs` to a human label for attribution. */
export function sourceLabel(source: string | null): string {
  if (!source) return 'Unknown'
  const map: Record<string, string> = {
    massive: 'Polygon.io',
    fmp: 'Financial Modeling Prep',
    twelvedata: 'Twelve Data',
    eodhd: 'EODHD',
    marketstack: 'Marketstack',
    alphav: 'Alpha Vantage',
    yahoo: 'Yahoo Finance',
    none: 'No source',
  }
  return map[source] || source
}

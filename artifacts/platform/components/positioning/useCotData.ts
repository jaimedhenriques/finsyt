'use client'
/**
 * useCotData (Task #410)
 * ──────────────────────
 * Client hooks for the Positioning & Regulatory Desk. `useCotMarkets`
 * fetches the curated CFTC market catalog (cheap, no upstream call);
 * `useCotReport` fetches the weekly Commitment-of-Traders history for a
 * single market. Both read `/api/cot` and surface the route's `source`,
 * `providerError` and honest empty states verbatim.
 */
import { useEffect, useState } from 'react'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

export interface CotMarket {
  code: string
  label: string
  group: string
}

export interface CotLeg { long: number; short: number; net: number }

export interface CotReport {
  date: string
  openInterest: number | null
  noncommercial: CotLeg
  commercial: CotLeg
  nonreportable: CotLeg
}

export interface CotResult {
  market: { code: string; label: string; name: string | null }
  reports: CotReport[]
  latest: CotReport | null
  count: number
  source: string
  providerError: string | null
  fetchedAt: string
}

export function useCotMarkets() {
  const [markets, setMarkets] = useState<CotMarket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`${BASE}/api/cot?list=1`)
      .then(r => r.json())
      .then((j: { markets?: CotMarket[] }) => { if (!cancelled) setMarkets(j.markets || []) })
      .catch(() => { if (!cancelled) setMarkets([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { markets, loading }
}

export function useCotReport(marketCode: string | null, weeks = 52) {
  const [data, setData] = useState<CotResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!marketCode) { setData(null); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    const sp = new URLSearchParams({ market: marketCode, weeks: String(weeks) })
    fetch(`${BASE}/api/cot?${sp.toString()}`)
      .then(r => r.json())
      .then((j: CotResult) => { if (!cancelled) setData(j) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [marketCode, weeks])

  return { data, loading, error }
}

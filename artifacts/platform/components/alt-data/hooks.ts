'use client'
/**
 * React hooks over the shared altDataCache (Task #326).
 *
 * Each hook is thin: it subscribes a component to a cached fetcher and
 * tracks loading / error locally. Because the underlying cache dedupes by
 * key, multiple cards (or multiple pages) asking for the same ticker share
 * a single Apify run.
 */
import { useEffect, useState } from 'react'
import {
  getApifyConnection,
  fetchCapitolTrades,
  fetchGlassdoor,
  fetchFilingSignals,
  type ConnectionRow,
  type CapitolTrade,
  type GlassdoorSnapshot,
  type FilingSignals,
} from './altDataCache'

/** `undefined` while detecting, then the connection or `null`. */
export function useApifyConnection(): ConnectionRow | null | undefined {
  const [conn, setConn] = useState<ConnectionRow | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    getApifyConnection()
      .then((v) => { if (!cancelled) setConn(v) })
      .catch(() => { if (!cancelled) setConn(null) })
    return () => { cancelled = true }
  }, [])
  return conn
}

interface AsyncState<T> { data: T; loading: boolean; error: string | null }

export function useCapitolTrades(conn: ConnectionRow | null | undefined, symbol: string): AsyncState<CapitolTrade[]> {
  const [state, setState] = useState<AsyncState<CapitolTrade[]>>({ data: [], loading: false, error: null })
  useEffect(() => {
    if (!conn || !symbol) { setState({ data: [], loading: false, error: null }); return }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fetchCapitolTrades(conn.id, symbol)
      .then((rows) => { if (!cancelled) setState({ data: rows, loading: false, error: null }) })
      .catch((e) => { if (!cancelled) setState({ data: [], loading: false, error: String(e?.message || e) }) })
    return () => { cancelled = true }
  }, [conn, symbol])
  return state
}

export function useGlassdoor(conn: ConnectionRow | null | undefined, companyName: string, symbol: string): AsyncState<GlassdoorSnapshot | null> {
  const [state, setState] = useState<AsyncState<GlassdoorSnapshot | null>>({ data: null, loading: false, error: null })
  useEffect(() => {
    if (!conn || !symbol) { setState({ data: null, loading: false, error: null }); return }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fetchGlassdoor(conn.id, companyName, symbol)
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }) })
      .catch((e) => { if (!cancelled) setState({ data: null, loading: false, error: String(e?.message || e) }) })
    return () => { cancelled = true }
  }, [conn, companyName, symbol])
  return state
}

export function useFilingSignals(conn: ConnectionRow | null | undefined, symbol: string): AsyncState<FilingSignals> {
  const [state, setState] = useState<AsyncState<FilingSignals>>({ data: { byAccession: {}, items: [] }, loading: false, error: null })
  useEffect(() => {
    if (!conn || !symbol) { setState({ data: { byAccession: {}, items: [] }, loading: false, error: null }); return }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fetchFilingSignals(conn.id, symbol)
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }) })
      .catch((e) => { if (!cancelled) setState({ data: { byAccession: {}, items: [] }, loading: false, error: String(e?.message || e) }) })
    return () => { cancelled = true }
  }, [conn, symbol])
  return state
}

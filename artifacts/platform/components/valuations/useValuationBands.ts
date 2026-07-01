'use client'
/**
 * useValuationBands — assemble the typed `bands` array driving the
 * FootballFieldChart from real platform data.
 *
 * Pulls /api/quote for the subject and each peer, calls /api/dcf with the
 * chosen WACC + terminal-growth assumptions, and computes an equal-weighted
 * "Weighted Valuation" from the medians of every band that has real data.
 * Rows that lack data render as faint placeholder bars instead of being
 * fabricated.
 *
 * The hook is deliberately UI-agnostic — it returns a typed result a chart
 * can consume directly.
 */
import { useEffect, useMemo, useState } from 'react'
import type { ValuationBand } from './FootballFieldChart'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// Default peer set used when the caller does not supply one. Mirrors the
// fallback used by `PeerCompareModal` so the user sees the same companies
// from both surfaces.
const DEFAULT_PEERS: Record<string, string[]> = {
  AAPL:  ['MSFT', 'GOOGL', 'META'],
  MSFT:  ['AAPL', 'GOOGL', 'AMZN'],
  GOOGL: ['MSFT', 'META',  'AMZN'],
  NVDA:  ['AMD',  'AVGO',  'INTC'],
  META:  ['GOOGL','SNAP',  'PINS'],
  AMZN:  ['MSFT', 'GOOGL', 'WMT'],
  TSLA:  ['F',    'GM',    'RIVN'],
}

// Universal fallback used when a symbol has no curated peer set —
// matches `PeerCompareModal`'s unknown-symbol default so both surfaces
// agree on what the user sees first.
const UNIVERSAL_FALLBACK_PEERS = ['SPY', 'QQQ', 'DIA']

export function defaultPeersFor(symbol: string): string[] {
  return DEFAULT_PEERS[symbol] || UNIVERSAL_FALLBACK_PEERS
}

export interface ValuationBandsOpts {
  peers?: string[]
  /** Decimal e.g. 0.09 = 9 %. Forwarded to /api/dcf. */
  wacc?: number
  /** Decimal e.g. 0.025 = 2.5 %. Forwarded to /api/dcf. */
  terminalGrowth?: number
  /**
   * Optional pre-fetched subject quote (so the company-page tab does not
   * refetch the subject when it already has the data).
   */
  initialQuote?: Record<string, unknown>
  /**
   * Toggle bands on/off. Each id maps to a group/row identifier.
   * Disabled bands are still returned (so the row stays in the chart) but
   * are dimmed-out via `placeholder = true`.
   */
  enabled?: Record<string, boolean>
}

/** Shape of one implied-price range returned by /api/valuations/tx-comps */
interface TxImpliedRange {
  q1: number | null
  median: number | null
  q3: number | null
  count: number
}

/** Full response from /api/valuations/tx-comps */
export interface TxCompsResult {
  implied: {
    evRevenue: TxImpliedRange
    evEbitda:  TxImpliedRange
    evEbit:    TxImpliedRange
    equityNI:  TxImpliedRange
  }
  compCount: number
  source: 'fmp' | 'none'
  note: string
}

export interface ValuationBandsResult {
  bands: ValuationBand[]
  currentPrice: number | null
  weightedValuation: number | null
  /** The list of band labels actually contributing to the weighted average. */
  weightedFrom: string[]
  loading: boolean
  error: string | null
  /** Subject quote (so the host page can read e.g. quote.name without refetching). */
  quote: any | null
  /** Raw DCF response so the caller can show base / range numbers. */
  dcf: any | null
  /** Raw peer quotes keyed by symbol. */
  peerQuotes: Record<string, any>
  /** Effective peer list used after de-duplication / cleanup. */
  effectivePeers: string[]
  /** Raw transaction comps result from /api/valuations/tx-comps. */
  txComps: TxCompsResult | null
}

function num(v: any): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function quartile(values: number[], q: number): number | null {
  const xs = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (xs.length === 0) return null
  const idx = (xs.length - 1) * q
  const lo = Math.floor(idx); const hi = Math.ceil(idx)
  if (lo === hi) return xs[lo]
  return xs[lo] + (xs[hi] - xs[lo]) * (idx - lo)
}

function median(values: number[]): number | null {
  return quartile(values, 0.5)
}

interface PeerCompMeta {
  /** Chart row label. */
  label: string
  /** Field name on the quote payload exposing the multiple. */
  multipleField: string
  /**
   * Per-share metric on the *subject* used to scale a peer multiple to an
   * implied price. Returns null when the metric isn't recoverable from the
   * quote payload — the row falls back to a placeholder.
   */
  metric: (subject: any) => number | null
  /**
   * Optional explanatory caption for the calc-popover & info text.
   */
  note?: string
}

const PEER_ROWS: PeerCompMeta[] = [
  {
    label: 'TEV/EBITDA',
    multipleField: 'evEbitda',
    // implied price = peer EV/EBITDA × subject EBITDA / shares − netDebt/shares
    // For simplicity (and since the quote payload omits netDebt), we use the
    // proportional approximation: implied_price ≈ subject.price × peer/subject.
    // This holds when capital structure is similar.
    metric: (s) => {
      const px = num(s?.price); const ev = num(s?.evEbitda)
      if (px == null || !ev) return null
      return px / ev   // "subject metric per multiple unit" — used as multiplier
    },
    note: 'Approximation: implied price ≈ subject price × (peer EV/EBITDA ÷ subject EV/EBITDA)',
  },
  {
    label: 'TEV/Revenue',
    multipleField: 'ps',
    // /api/quote does not expose a clean TEV/Revenue field; we fall back to
    // P/S as the closest usable proxy. This is a rough approximation when
    // capital structures differ but lets the chart show a meaningful range
    // for typical large-cap names.
    metric: (s) => {
      const px = num(s?.price); const ps = num(s?.ps)
      if (px == null || !ps) return null
      return px / ps
    },
    note: 'Proxy: uses Price/Sales when TEV/Revenue is not exposed by the data provider',
  },
  {
    label: 'Price/Earnings',
    multipleField: 'pe',
    // implied price = peer P/E × subject EPS — the cleanest of the four
    // because EPS is exposed directly.
    metric: (s) => num(s?.eps),
  },
  {
    label: 'TEV/EBIT',
    // Not exposed by /api/quote. The row will render as a placeholder.
    multipleField: '__missing__',
    metric: () => null,
  },
]

const TX_COMP_ROWS = [
  'Implied EV / Revenue',
  'Implied EV / EBITDA',
  'Implied EV / EBIT',
  'Implied Equity Value / Net Income',
] as const

export function useValuationBands(symbol: string, opts: ValuationBandsOpts = {}): ValuationBandsResult {
  const { peers, wacc, terminalGrowth, initialQuote, enabled } = opts

  const effectivePeers = useMemo(() => {
    const list = (peers ?? defaultPeersFor(symbol))
      .map(p => (p || '').trim().toUpperCase())
      .filter(p => p && p !== symbol.toUpperCase())
    return Array.from(new Set(list)).slice(0, 3)
  }, [peers, symbol])

  const [quote, setQuote] = useState<any | null>(initialQuote || null)
  const [peerQuotes, setPeerQuotes] = useState<Record<string, any>>({})
  const [dcf, setDcf] = useState<any | null>(null)
  const [txComps, setTxComps] = useState<TxCompsResult | null>(null)
  // Track quote-fetch, DCF-fetch, and tx-comps fetch lifecycles independently
  // so peer-only updates don't get wedged behind DCF, and so DCF re-runs
  // don't blank out the quote. The exposed `loading` is the OR of the three.
  const [quoteLoading, setQuoteLoading] = useState(true)
  const [dcfLoading, setDcfLoading] = useState(true)
  const [txLoading, setTxLoading] = useState(true)
  const loading = quoteLoading || dcfLoading || txLoading
  const [error, setError] = useState<string | null>(null)

  // Subject + peer quotes — augmented with key-metrics + ratios so the
  // chart can compute Peer Comps even when the lightweight /api/quote
  // payload omits multiples (pe, ps, evEbitda) and 52-week range.
  useEffect(() => {
    let cancelled = false
    setQuoteLoading(true)
    setError(null)

    async function loadOne(sym: string, pre?: any): Promise<any> {
      const baseQuote = pre
        ? pre
        : await fetch(`${BASE}/api/quote?symbol=${encodeURIComponent(sym)}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
      const [km, ra] = await Promise.all([
        fetch(`${BASE}/api/financials/statements?symbol=${encodeURIComponent(sym)}&statement=key-metrics&period=annual&limit=1`)
          .then(r => r.ok ? r.json() : null).then(j => j?.rows?.[0] || null).catch(() => null),
        fetch(`${BASE}/api/financials/statements?symbol=${encodeURIComponent(sym)}&statement=ratios&period=annual&limit=1`)
          .then(r => r.ok ? r.json() : null).then(j => j?.rows?.[0] || null).catch(() => null),
      ])
      // If the upstream quote payload is absent or carries an error envelope
      // and we have no fundamentals to fall back on, return null so callers
      // can render a true empty state instead of a fabricated chart.
      const quoteUsable = baseQuote && !baseQuote.error && (baseQuote.price != null || baseQuote.symbol)
      if (!quoteUsable && !km && !ra) return null
      const merged: any = { ...(quoteUsable ? baseQuote : {}) }
      if (merged.pe == null && ra?.priceToEarningsRatio != null) merged.pe = ra.priceToEarningsRatio
      if (merged.ps == null && ra?.priceToSalesRatio != null) merged.ps = ra.priceToSalesRatio
      if (merged.evEbitda == null && km?.evToEBITDA != null) merged.evEbitda = km.evToEBITDA
      // EPS via subject price / P/E (only useful for subject; peers handled via field).
      if (merged.eps == null && merged.price != null && merged.pe) merged.eps = merged.price / merged.pe
      return merged
    }

    Promise.all([
      loadOne(symbol, initialQuote),
      ...effectivePeers.map(p => loadOne(p)),
    ]).then(arr => {
      if (cancelled) return
      const [subj, ...rest] = arr
      setQuote(subj || null)
      const map: Record<string, any> = {}
      effectivePeers.forEach((p, i) => { map[p] = rest[i] || null })
      setPeerQuotes(map)
    }).catch(e => {
      if (!cancelled) setError(String(e))
    }).finally(() => {
      if (!cancelled) setQuoteLoading(false)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, effectivePeers.join(','), initialQuote])

  // DCF — POSTed (not GET) because the endpoint is auth-gated and accepts
  // a structured body for the ticker-anchored sensitivity run: symbol +
  // WACC + terminal growth + per-stage growth rates + `sensitivity:true`
  // returns a 2-D grid (WACC × terminal growth) we use to build the band
  // min/max. The GET form sketched in earlier API drafts only returns a
  // single base case and isn't sufficient for the band edges.
  useEffect(() => {
    let cancelled = false
    setDcfLoading(true)
    setDcf(null)
    fetch(`${BASE}/api/dcf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        discountRate:   wacc ?? 0.09,
        terminalGrowth: terminalGrowth ?? 0.025,
        growthStage1:   0.08,
        growthStage2:   0.04,
        sensitivity:    true,
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setDcf(j) })
      .catch(() => { if (!cancelled) setDcf(null) })
      .finally(() => { if (!cancelled) setDcfLoading(false) })
    return () => { cancelled = true }
  }, [symbol, wacc, terminalGrowth])

  // Transaction Comps — fetched separately from the precedent-transaction
  // multiples endpoint. Runs once per symbol change (not per WACC change,
  // since deal multiples are independent of DCF assumptions).
  useEffect(() => {
    let cancelled = false
    setTxLoading(true)
    setTxComps(null)
    fetch(`${BASE}/api/valuations/tx-comps?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setTxComps(j as TxCompsResult | null) })
      .catch(() => { if (!cancelled) setTxComps(null) })
      .finally(() => { if (!cancelled) setTxLoading(false) })
    return () => { cancelled = true }
  }, [symbol])

  const result = useMemo<ValuationBandsResult>(() => {
    const bands: ValuationBand[] = []

    // ── 52-Week Stock Price ────────────────────────────────────────────────
    const lo52 = num(quote?.yearLow ?? quote?.low52w)
    const hi52 = num(quote?.yearHigh ?? quote?.high52w)
    const enabled52 = enabled?.['52w'] !== false
    bands.push({
      group: '52 Week Stock Price',
      label: '52 Week Stock Price',
      low: enabled52 ? lo52 : null,
      high: enabled52 ? hi52 : null,
      median: (enabled52 && lo52 != null && hi52 != null) ? (lo52 + hi52) / 2 : null,
      color: 'gray',
      placeholder: !enabled52 || lo52 == null || hi52 == null,
      placeholderCaption: !enabled52 ? 'Hidden' : (lo52 == null || hi52 == null ? '52-week range unavailable' : undefined),
    })

    // ── Peer Comps ─────────────────────────────────────────────────────────
    const peerSyms = effectivePeers
    const peerArr = peerSyms.map(p => peerQuotes[p]).filter(Boolean)
    for (const meta of PEER_ROWS) {
      const rowEnabled = enabled?.[`peer:${meta.label}`] !== false
      const subjectMetric = meta.metric(quote)
      const peerMultiples = peerArr
        .map(q => num(q?.[meta.multipleField]))
        .filter((v): v is number => v != null && v > 0)
      const haveData = rowEnabled && subjectMetric != null && peerMultiples.length >= 2 && meta.multipleField !== '__missing__'
      let low: number | null = null, high: number | null = null, med: number | null = null
      if (haveData) {
        const q1 = quartile(peerMultiples, 0.25)
        const q3 = quartile(peerMultiples, 0.75)
        const m  = median(peerMultiples)
        low  = q1 != null ? q1 * subjectMetric : null
        high = q3 != null ? q3 * subjectMetric : null
        med  = m  != null ? m  * subjectMetric : null
        if (low != null && high != null && low > high) [low, high] = [high, low]
      }
      // Per-row annotation (rendered as a small caption below the label by the
      // chart) makes proxy/missing-field methodology explicit at a glance —
      // independent of the "How this is calculated" popover.
      let annotation: string | undefined
      if (meta.label === 'TEV/Revenue') annotation = 'P/S proxy'
      else if (meta.label === 'TEV/EBIT') annotation = 'Provider does not expose'
      bands.push({
        group: 'Peer Comps',
        label: meta.label,
        low, high, median: med,
        color: 'teal',
        annotation,
        placeholder: !haveData,
        placeholderCaption: !rowEnabled
          ? 'Hidden'
          : meta.multipleField === '__missing__'
            ? 'Provider does not expose TEV/EBIT'
            : peerMultiples.length < 2
              ? 'Need at least 2 peers with data'
              : 'Insufficient peer data',
      })
    }

    // ── Transaction Comps ──────────────────────────────────────────────────
    // Rows are driven by /api/valuations/tx-comps. Each row maps to a
    // specific implied-price range (q1 → low, median → median, q3 → high).
    // When the endpoint returns no data or fewer than 2 comparables, the row
    // falls back to an honest placeholder instead of fabricating a bar.
    const txEnabled = enabled?.['tx'] !== false

    interface TxRowMeta {
      label: typeof TX_COMP_ROWS[number]
      key: keyof NonNullable<TxCompsResult['implied']>
      enabledKey: string
    }
    const TX_ROW_META: TxRowMeta[] = [
      { label: 'Implied EV / Revenue',               key: 'evRevenue', enabledKey: 'tx:Implied EV / Revenue' },
      { label: 'Implied EV / EBITDA',                key: 'evEbitda',  enabledKey: 'tx:Implied EV / EBITDA' },
      { label: 'Implied EV / EBIT',                  key: 'evEbit',    enabledKey: 'tx:Implied EV / EBIT' },
      { label: 'Implied Equity Value / Net Income',  key: 'equityNI',  enabledKey: 'tx:Implied Equity Value / Net Income' },
    ]

    for (const meta of TX_ROW_META) {
      const rowEnabled = txEnabled && enabled?.[meta.enabledKey] !== false
      const range = txComps?.implied?.[meta.key]
      const haveData = rowEnabled && range != null && range.count >= 2
        && range.q1 != null && range.q3 != null && range.median != null

      let low: number | null = null
      let high: number | null = null
      let med: number | null = null
      let annotation: string | undefined

      if (haveData) {
        low  = range.q1
        high = range.q3
        med  = range.median
        annotation = `${range.count} precedent transaction${range.count === 1 ? '' : 's'} · FMP`
        // Ensure low ≤ high
        if (low != null && high != null && low > high) [low, high] = [high, low]
      }

      let placeholderCaption: string
      if (!rowEnabled) {
        placeholderCaption = 'Hidden'
      } else if (txLoading) {
        placeholderCaption = 'Loading precedent transactions…'
      } else if (!txComps || txComps.source === 'none') {
        placeholderCaption = 'No M&A deal data available'
      } else if (!range || range.count < 2) {
        const c = range?.count ?? 0
        placeholderCaption = c === 1
          ? 'Only 1 comparable — need ≥ 2'
          : 'No comparable transactions found'
      } else {
        placeholderCaption = 'Insufficient data'
      }

      bands.push({
        group: 'Transaction Comps',
        label: meta.label,
        low, high, median: med,
        color: 'amber',
        annotation: haveData ? annotation : undefined,
        placeholder: !haveData,
        placeholderCaption: !haveData ? placeholderCaption : undefined,
      })
    }

    // ── DCF ────────────────────────────────────────────────────────────────
    const enabledDcf = enabled?.['dcf'] !== false
    const sens = dcf?.sensitivity
    let dcfLow: number | null = null, dcfHigh: number | null = null, dcfMed: number | null = null
    if (enabledDcf && sens && Array.isArray(sens.values)) {
      const flat: number[] = []
      for (const row of sens.values as number[][]) for (const v of row) if (Number.isFinite(v)) flat.push(v)
      if (flat.length) {
        dcfLow = Math.min(...flat)
        dcfHigh = Math.max(...flat)
      }
      dcfMed = num(dcf?.intrinsicValuePerShare)
    } else if (enabledDcf) {
      dcfMed = num(dcf?.intrinsicValuePerShare)
    }
    const waccPct = ((wacc ?? 0.09) * 100).toFixed(2) + '% WACC'
    const tgPct   = ((terminalGrowth ?? 0.025) * 100).toFixed(2) + '% Terminal Growth Rate'
    bands.push({
      group: 'DCF',
      label: 'DCF',
      low: dcfLow, high: dcfHigh, median: dcfMed,
      color: 'violet',
      annotation: `${waccPct} · ${tgPct}`,
      placeholder: !enabledDcf || (dcfLow == null && dcfMed == null),
      placeholderCaption: !enabledDcf
        ? 'Hidden'
        : dcf?.error
          ? 'DCF unavailable for this ticker'
          : 'DCF data still loading',
    })

    // ── Weighted valuation ─────────────────────────────────────────────────
    const contributors: { label: string; price: number }[] = []
    for (const b of bands) {
      if (b.placeholder) continue
      if (b.median != null && Number.isFinite(b.median)) {
        contributors.push({ label: `${b.group} · ${b.label}`, price: b.median })
      }
    }
    const weighted = contributors.length
      ? contributors.reduce((acc, c) => acc + c.price, 0) / contributors.length
      : null

    return {
      bands,
      currentPrice: num(quote?.price),
      weightedValuation: weighted,
      weightedFrom: contributors.map(c => c.label),
      loading,
      error,
      quote,
      dcf,
      peerQuotes,
      effectivePeers,
      txComps,
    }
  }, [quote, dcf, txComps, txLoading, peerQuotes, effectivePeers, wacc, terminalGrowth, enabled, loading, error])

  return result
}

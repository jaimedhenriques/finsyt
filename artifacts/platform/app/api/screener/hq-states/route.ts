import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/screener/hq-states?symbols=AAPL,MSFT,...
 *
 * Returns: { rows: [{ symbol, country, state }] }
 *
 * Looks up the FMP company profile for each symbol (in parallel, concurrency
 * limited) and returns the registered HQ state. Used by the screener's
 * geography-aware filter to map tickers → US state for Census joins.
 *
 * Server-side cache: 24h per symbol (in-memory).
 */

const FMP = process.env.FMP_API_KEY
const TTL_MS = 24 * 60 * 60 * 1000
const MAX_SYMBOLS = 100
const CONCURRENCY = 6

interface HqRow { symbol: string; country: string; state: string }
const _cache = new Map<string, { at: number; row: HqRow }>()

async function fetchOne(symbol: string): Promise<HqRow> {
  const cached = _cache.get(symbol)
  if (cached && Date.now() - cached.at < TTL_MS) return cached.row
  if (!FMP) {
    const row = { symbol, country: '', state: '' }
    _cache.set(symbol, { at: Date.now(), row })
    return row
  }
  try {
    const r = await fetch(`https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${FMP}`, { next: { revalidate: 86400 } })
    const arr = await r.json().catch(() => [])
    const p = Array.isArray(arr) ? arr[0] : arr
    const row: HqRow = {
      symbol,
      country: (p?.country || '').toUpperCase(),
      state: (p?.state || '').toUpperCase(),
    }
    _cache.set(symbol, { at: Date.now(), row })
    return row
  } catch {
    const row = { symbol, country: '', state: '' }
    _cache.set(symbol, { at: Date.now(), row })
    return row
  }
}

async function mapWithLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++
      if (idx >= items.length) return
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbols') || ''
  const symbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, MAX_SYMBOLS)
  if (!symbols.length) {
    return NextResponse.json({ error: 'symbols required (comma-separated)', example: '/api/screener/hq-states?symbols=AAPL,MSFT' }, { status: 400 })
  }
  const rows = await mapWithLimit(symbols, CONCURRENCY, fetchOne)
  return NextResponse.json({ source: 'fmp', rows })
}

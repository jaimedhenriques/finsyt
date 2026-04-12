import { NextRequest, NextResponse } from 'next/server'
import { PROVIDERS, massiveSearch } from '@/lib/data-providers'

const FMP   = PROVIDERS.fmp
const EODHD = PROVIDERS.eodhd
const FINNHUB = PROVIDERS.finnhub

export async function GET(req: NextRequest) {
  const q     = req.nextUrl.searchParams.get('q')?.trim()
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '10')
  if (!q) return NextResponse.json({ results: [] })

  // ── 1. Massive ────────────────────────────────────────────────────────────
  if (PROVIDERS.massive) {
    try {
      const results = await massiveSearch(q, limit)
      if (results && results.length > 0) {
        return NextResponse.json({
          results: results.map((r: any) => ({
            symbol:   r.ticker,
            name:     r.name,
            exchange: r.primary_exchange?.replace('XNAS','NASDAQ').replace('XNYS','NYSE') || '',
            type:     r.type,
            currency: r.currency_name?.toUpperCase() || 'USD',
            active:   r.active,
            source:   'massive',
          })),
          source: 'massive',
        })
      }
    } catch (e) { console.warn('[search] Massive failed:', (e as Error).message) }
  }

  // ── 2. FMP ─────────────────────────────────────────────────────────────────
  if (FMP) {
    try {
      const res  = await fetch(`https://financialmodelingprep.com/stable/search?query=${encodeURIComponent(q)}&limit=${limit}&apikey=${FMP}`)
      const data = await res.json()
      if (Array.isArray(data) && data.length) {
        return NextResponse.json({
          results: data.map((r: any) => ({
            symbol:   r.symbol,
            name:     r.name,
            exchange: r.stockExchange || r.exchangeShortName || '',
            type:     r.type || 'stock',
            currency: r.currency || 'USD',
            source:   'fmp',
          })),
          source: 'fmp',
        })
      }
    } catch (e) { console.warn('[search] FMP failed:', (e as Error).message) }
  }

  // ── 3. EODHD ──────────────────────────────────────────────────────────────
  if (EODHD) {
    try {
      const res  = await fetch(`https://eodhd.com/api/search/${encodeURIComponent(q)}?api_token=${EODHD}&limit=${limit}&fmt=json`)
      const data = await res.json()
      if (Array.isArray(data) && data.length) {
        return NextResponse.json({
          results: data.map((r: any) => ({
            symbol:   r.Code,
            name:     r.Name,
            exchange: r.Exchange || '',
            type:     r.Type || 'stock',
            currency: r.Currency || 'USD',
            source:   'eodhd',
          })),
          source: 'eodhd',
        })
      }
    } catch (e) { console.warn('[search] EODHD failed:', (e as Error).message) }
  }

  // ── 4. Finnhub ────────────────────────────────────────────────────────────
  if (FINNHUB) {
    try {
      const res  = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB}`)
      const { result } = await res.json()
      if (result?.length) {
        return NextResponse.json({
          results: result.slice(0, limit).map((r: any) => ({
            symbol:   r.symbol,
            name:     r.description,
            exchange: r.type,
            type:     r.type,
            source:   'finnhub',
          })),
          source: 'finnhub',
        })
      }
    } catch (e) { console.warn('[search] Finnhub failed:', (e as Error).message) }
  }

  return NextResponse.json({ results: [], source: 'none' })
}

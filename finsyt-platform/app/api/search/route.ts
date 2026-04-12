import { NextRequest, NextResponse } from 'next/server'
import { PROVIDERS, massiveSearch, yahooSearch, marketstackSearch } from '@/lib/data-providers'

const FMP     = PROVIDERS.fmp
const EODHD   = PROVIDERS.eodhd
const FINNHUB = PROVIDERS.finnhub

export async function GET(req: NextRequest) {
  const q     = req.nextUrl.searchParams.get('q')?.trim()
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '10')
  if (!q) return NextResponse.json({ results: [] })

  // 1. Massive (US stocks, comprehensive)
  if (PROVIDERS.massive) {
    try {
      const r = await massiveSearch(q, limit)
      if (r?.length) return NextResponse.json({ results: r.map((x: any) => ({ symbol: x.ticker, name: x.name, exchange: x.primary_exchange?.replace('XNAS','NASDAQ').replace('XNYS','NYSE')||'', type: x.type, currency: x.currency_name?.toUpperCase()||'USD', active: x.active, source: 'massive' })), source: 'massive' })
    } catch (e) { console.warn('[search] Massive failed') }
  }

  // 2. FMP
  if (FMP) {
    try {
      const res  = await fetch(`https://financialmodelingprep.com/stable/search?query=${encodeURIComponent(q)}&limit=${limit}&apikey=${FMP}`)
      const data = await res.json()
      if (Array.isArray(data) && data.length) return NextResponse.json({ results: data.map((r: any) => ({ symbol: r.symbol, name: r.name, exchange: r.stockExchange||r.exchangeShortName||'', type: r.type||'stock', currency: r.currency||'USD', source: 'fmp' })), source: 'fmp' })
    } catch (e) { console.warn('[search] FMP failed') }
  }

  // 3. Yahoo (best global coverage)
  if (PROVIDERS.yahoo) {
    try {
      const r = await yahooSearch(q, limit)
      if (r?.length) return NextResponse.json({ results: r.map((x: any) => ({ symbol: x.symbol, name: x.longname||x.shortname||x.symbol, exchange: x.exchange||x.exchDisp||'', type: x.typeDisp||x.quoteType||'stock', source: 'yahoo' })), source: 'yahoo' })
    } catch (e) { console.warn('[search] Yahoo failed') }
  }

  // 4. Marketstack
  if (PROVIDERS.marketstack) {
    try {
      const r = await marketstackSearch(q, limit)
      if (r?.length) return NextResponse.json({ results: r.map((x: any) => ({ symbol: x.symbol, name: x.name, exchange: x.stock_exchange?.acronym||'', type: 'stock', source: 'marketstack' })), source: 'marketstack' })
    } catch (e) { console.warn('[search] Marketstack failed') }
  }

  // 5. EODHD
  if (EODHD) {
    try {
      const res  = await fetch(`https://eodhd.com/api/search/${encodeURIComponent(q)}?api_token=${EODHD}&limit=${limit}&fmt=json`)
      const data = await res.json()
      if (Array.isArray(data) && data.length) return NextResponse.json({ results: data.map((r: any) => ({ symbol: r.Code, name: r.Name, exchange: r.Exchange||'', type: r.Type||'stock', currency: r.Currency||'USD', source: 'eodhd' })), source: 'eodhd' })
    } catch (e) { console.warn('[search] EODHD failed') }
  }

  // 6. Finnhub
  if (FINNHUB) {
    try {
      const res  = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB}`)
      const { result } = await res.json()
      if (result?.length) return NextResponse.json({ results: result.slice(0, limit).map((r: any) => ({ symbol: r.symbol, name: r.description, exchange: r.type, type: r.type, source: 'finnhub' })), source: 'finnhub' })
    } catch (e) { console.warn('[search] Finnhub failed') }
  }

  return NextResponse.json({ results: [], source: 'none' })
}

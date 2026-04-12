import { NextRequest, NextResponse } from 'next/server'
import { PROVIDERS, massiveNews } from '@/lib/data-providers'

const FMP     = PROVIDERS.fmp
const EODHD   = PROVIDERS.eodhd
const FINNHUB = PROVIDERS.finnhub

function normalise(item: any, source: string) {
  return {
    id:          item.id || item.url || item.link || item.article_url,
    title:       item.title || item.headline || '',
    summary:     (item.description || item.content || item.summary || item.text || '').slice(0, 500),
    url:         item.article_url || item.link || item.url || '',
    source:      item.publisher?.name || item.source || item.site || source,
    publishedAt: item.published_utc || item.publishedDate || item.date || item.datetime || '',
    sentiment:   item.insights?.[0]?.sentiment || item.sentiment || null,
    tickers:     item.tickers || item.symbols || (item.symbol ? [item.symbol] : []),
    tags:        item.keywords || item.tags || (item.category ? [item.category] : []),
    image:       item.image_url || item.image || item.img || null,
    dataSource:  source,
  }
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const limit  = parseInt(req.nextUrl.searchParams.get('limit') || '40')
  const from   = req.nextUrl.searchParams.get('from') || new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
  const to     = req.nextUrl.searchParams.get('to')   || new Date().toISOString().slice(0, 10)

  const allArticles: any[] = []
  const seen = new Set<string>()

  // ── Source 1: Massive (Polygon) — best quality, includes publisher, tickers, keywords ──
  if (PROVIDERS.massive) {
    try {
      const results = await massiveNews(symbol, Math.ceil(limit * 1.2))
      ;(Array.isArray(results) ? results : []).forEach((item: any) => {
        const key = item.article_url || item.title
        if (!seen.has(key)) { seen.add(key); allArticles.push(normalise(item, 'massive')) }
      })
    } catch (e) { console.warn('[news] Massive failed:', (e as Error).message) }
  }

  // ── Source 2: FMP ─────────────────────────────────────────────────────────
  if (FMP) {
    try {
      const url = symbol
        ? `https://financialmodelingprep.com/stable/news/stock?symbols=${symbol}&limit=${limit}&apikey=${FMP}`
        : `https://financialmodelingprep.com/stable/news/general-latest?limit=${limit}&apikey=${FMP}`
      const res  = await fetch(url, { next: { revalidate: 300 } })
      const data = await res.json()
      ;(Array.isArray(data) ? data : []).forEach((item: any) => {
        const key = item.url || item.title
        if (!seen.has(key)) { seen.add(key); allArticles.push(normalise(item, 'fmp')) }
      })
    } catch (e) { console.warn('[news] FMP failed:', (e as Error).message) }
  }

  // ── Source 3: EODHD (strong sentiment scoring) ────────────────────────────
  if (EODHD) {
    try {
      const eodSymbol = symbol ? (symbol.includes('.') ? symbol : `${symbol}.US`) : ''
      const params = new URLSearchParams({ api_token: EODHD, limit: String(Math.min(limit, 50)), fmt: 'json' })
      if (eodSymbol) params.set('s', eodSymbol)
      if (from) params.set('from', from); if (to) params.set('to', to)
      const res  = await fetch(`https://eodhd.com/api/news?${params}`, { next: { revalidate: 300 } })
      const data = await res.json()
      ;(Array.isArray(data) ? data : []).forEach((item: any) => {
        const key = item.link || item.title
        if (!seen.has(key)) { seen.add(key); allArticles.push(normalise(item, 'eodhd')) }
      })
    } catch (e) { console.warn('[news] EODHD failed:', (e as Error).message) }
  }

  // ── Source 4: Finnhub ─────────────────────────────────────────────────────
  if (FINNHUB && symbol) {
    try {
      const res  = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB}`)
      const data = await res.json()
      ;(Array.isArray(data) ? data : []).slice(0, 20).forEach((item: any) => {
        const key = item.url || item.headline
        if (!seen.has(key)) { seen.add(key); allArticles.push(normalise({ ...item, title: item.headline }, 'finnhub')) }
      })
    } catch (e) { console.warn('[news] Finnhub failed:', (e as Error).message) }
  }

  const sorted = allArticles
    .filter(a => a.title)
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .slice(0, limit)

  const sources = [...new Set(sorted.map(a => a.dataSource))]
  return NextResponse.json({ articles: sorted, total: sorted.length, sources })
}

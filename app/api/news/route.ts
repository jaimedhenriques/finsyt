import { NextRequest, NextResponse } from 'next/server'

const EODHD   = process.env.EODHD_API_KEY || process.env.eodhd_api
const FINNHUB = process.env.FINNHUB_API_KEY
const FMP     = process.env.FMP_API_KEY

function normalise(item: any, source: string) {
  return {
    id:          item.id || item.url || item.link,
    title:       item.title || item.headline || '',
    summary:     (item.content || item.summary || item.text || '').slice(0, 400),
    url:         item.link || item.url || '',
    source:      item.source || item.site || source,
    publishedAt: item.date || item.publishedDate || item.datetime || '',
    sentiment:   item.sentiment || null,
    tickers:     item.symbols || item.tickers || (item.symbol ? [item.symbol] : []),
    tags:        item.tags || item.category ? [item.category] : [],
    image:       item.image || item.img || null,
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

  // ── Source 1: FMP (company-specific or general) ───────────────────────────
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
    } catch (e) { console.error('FMP news failed:', e) }
  }

  // ── Source 2: EODHD (strong sentiment scoring) ───────────────────────────
  if (EODHD) {
    try {
      const eodSymbol = symbol ? (symbol.includes('.') ? symbol : `${symbol}.US`) : ''
      const params = new URLSearchParams({ api_token: EODHD, limit: String(Math.min(limit, 50)), fmt: 'json' })
      if (eodSymbol) params.set('s', eodSymbol)
      if (from) params.set('from', from)
      if (to)   params.set('to', to)
      const res  = await fetch(`https://eodhd.com/api/news?${params}`, { next: { revalidate: 300 } })
      const data = await res.json()
      ;(Array.isArray(data) ? data : []).forEach((item: any) => {
        const key = item.link || item.title
        if (!seen.has(key)) { seen.add(key); allArticles.push(normalise(item, 'eodhd')) }
      })
    } catch (e) { console.error('EODHD news failed:', e) }
  }

  // ── Source 3: Finnhub (company news, good coverage) ──────────────────────
  if (FINNHUB && symbol) {
    try {
      const res  = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB}`)
      const data = await res.json()
      ;(Array.isArray(data) ? data : []).slice(0, 20).forEach((item: any) => {
        const key = item.url || item.headline
        if (!seen.has(key)) { seen.add(key); allArticles.push(normalise({ ...item, title: item.headline }, 'finnhub')) }
      })
    } catch (e) { console.error('Finnhub news failed:', e) }
  }

  // Sort by date descending, dedupe, return
  const sorted = allArticles
    .filter(a => a.title)
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .slice(0, limit)

  return NextResponse.json(sorted)
}

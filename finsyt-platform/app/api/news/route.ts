import { NextRequest, NextResponse } from 'next/server'

const EODHD   = process.env.EODHD_API_KEY || process.env.eodhd_api
const FINNHUB = process.env.FINNHUB_API_KEY

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const limit  = parseInt(req.nextUrl.searchParams.get('limit') || '30')
  const from   = req.nextUrl.searchParams.get('from') || ''
  const to     = req.nextUrl.searchParams.get('to') || ''

  // Primary: EODHD — includes sentiment score per article
  if (EODHD) {
    try {
      const eodSymbol = symbol ? (symbol.includes('.') ? symbol : `${symbol}.US`) : ''
      const params = new URLSearchParams({
        api_token: EODHD,
        limit: String(Math.min(limit, 50)),
        fmt: 'json',
      })
      if (eodSymbol) params.set('s', eodSymbol)
      if (from) params.set('from', from)
      if (to) params.set('to', to)

      const res = await fetch(`https://eodhd.com/api/news?${params}`, { next: { revalidate: 300 } })
      const data = await res.json()

      if (Array.isArray(data) && data.length > 0) {
        return NextResponse.json(data.map((item: any) => ({
          id:        item.id || item.url,
          title:     item.title,
          summary:   item.content?.slice(0, 300) || item.summary || '',
          url:       item.link || item.url,
          source:    item.source || 'EODHD',
          publishedAt: item.date,
          sentiment: item.sentiment || null, // { polarity, neg, neu, pos }
          tickers:   item.symbols || [],
          tags:      item.tags || [],
          image:     item.image || null,
          dataSource: 'eodhd',
        })))
      }
    } catch (e) {
      console.error('EODHD news failed:', e)
    }
  }

  // Fallback: Finnhub
  if (FINNHUB && symbol) {
    try {
      const toDate   = to   || new Date().toISOString().split('T')[0]
      const fromDate = from || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
      const res = await fetch(
        `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${fromDate}&to=${toDate}&token=${FINNHUB}`
      )
      const data = await res.json()
      return NextResponse.json((data || []).slice(0, limit).map((item: any) => ({
        id:          item.id,
        title:       item.headline,
        summary:     item.summary,
        url:         item.url,
        source:      item.source,
        publishedAt: new Date(item.datetime * 1000).toISOString(),
        sentiment:   null,
        tickers:     [symbol],
        image:       item.image,
        dataSource:  'finnhub',
      })))
    } catch { return NextResponse.json([], { status: 200 }) }
  }

  return NextResponse.json([])
}

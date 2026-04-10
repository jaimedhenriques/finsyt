import { NextRequest, NextResponse } from 'next/server'
const FINNHUB = process.env.FINNHUB_API_KEY
const AV      = process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHA_VANTAGE_KEY

export async function GET(req: NextRequest) {
  const symbol  = req.nextUrl.searchParams.get('symbol') || ''
  const topics  = req.nextUrl.searchParams.get('topics') || 'general'
  const limit   = parseInt(req.nextUrl.searchParams.get('limit') || '20')
  const from    = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const to      = new Date().toISOString().slice(0, 10)

  try {
    let articles: any[] = []

    if (symbol) {
      // Company-specific news from Finnhub
      const res = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${symbol.toUpperCase()}&from=${from}&to=${to}&token=${FINNHUB}`)
      const data = await res.json()
      articles = (Array.isArray(data) ? data : []).slice(0, limit).map((n: any) => ({
        title:       n.headline,
        url:         n.url,
        publishedAt: new Date(n.datetime * 1000).toISOString(),
        summary:     n.summary,
        source:      n.source,
        banner:      n.image || null,
        sentiment:   null,
        tickers:     [symbol.toUpperCase()],
      }))
    } else {
      // Market-wide news from Finnhub by category
      const categoryMap: Record<string, string> = {
        general: 'general', financial_markets: 'general', earnings: 'general',
        mergers_and_acquisitions: 'merger', technology: 'technology',
        economy_macro: 'economy', forex: 'forex', crypto: 'crypto',
      }
      const cat = categoryMap[topics] || 'general'
      const res = await fetch(`https://finnhub.io/api/v1/news?category=${cat}&minId=0&token=${FINNHUB}`)
      const data = await res.json()
      articles = (Array.isArray(data) ? data : []).slice(0, limit).map((n: any) => ({
        title:       n.headline,
        url:         n.url,
        publishedAt: new Date(n.datetime * 1000).toISOString(),
        summary:     n.summary,
        source:      n.source,
        banner:      n.image || null,
        sentiment:   null,
        tickers:     n.related ? n.related.split(',').slice(0, 3) : [],
      }))
    }

    // Enrich with AV sentiment if available and small batch
    if (symbol && articles.length > 0 && AV) {
      try {
        const avRes = await fetch(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol.toUpperCase()}&limit=10&apikey=${AV}`)
        const avData = await avRes.json()
        const avMap: Record<string, string> = {}
        ;(avData.feed || []).forEach((a: any) => { avMap[a.url] = a.overall_sentiment_label })
        articles = articles.map(a => ({ ...a, sentiment: avMap[a.url] || a.sentiment }))
      } catch {}
    }

    return NextResponse.json({ articles })
  } catch {
    return NextResponse.json({ articles: [] })
  }
}

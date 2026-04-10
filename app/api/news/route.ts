import { NextRequest, NextResponse } from 'next/server'
const AV = process.env.ALPHA_VANTAGE_KEY
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')||''
  const topics = req.nextUrl.searchParams.get('topics')||'financial_markets'
  const limit = parseInt(req.nextUrl.searchParams.get('limit')||'20')
  try {
    const params = symbol ? `tickers=${symbol.toUpperCase()}&limit=${limit}` : `topics=${topics}&limit=${limit}`
    const res = await fetch(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&${params}&apikey=${AV}`)
    const data = await res.json()
    const articles = (data.feed||[]).slice(0,limit).map((item: any) => ({
      title: item.title, url: item.url, publishedAt: item.time_published,
      summary: item.summary, source: item.source,
      sentiment: item.overall_sentiment_label, sentimentScore: parseFloat(item.overall_sentiment_score||'0'),
      tickers: (item.ticker_sentiment||[]).slice(0,5).map((t: any) => t.ticker),
      banner: item.banner_image,
    }))
    return NextResponse.json({ articles })
  } catch { return NextResponse.json({ articles: [] }) }
}

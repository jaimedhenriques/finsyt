import { NextRequest, NextResponse } from 'next/server'
import { fetchAggregatedNews } from '@/lib/news-fetch'
import { lexiconScore, labelForScore, normalizeUpstreamSentiment } from '@/lib/news-sentiment-core'

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase() || undefined
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '40')
  const from = req.nextUrl.searchParams.get('from') || undefined
  const to = req.nextUrl.searchParams.get('to') || undefined

  const { articles, sources } = await fetchAggregatedNews({ symbol, limit, from, to })

  // Attach a CHEAP, deterministic sentiment to every article (upstream hint
  // when present, else lexicon heuristic — never an LLM call here, so the feed
  // stays fast). The LLM-backed scoring + deviation lives behind
  // /api/news/sentiment.
  const withSentiment = articles.map(a => {
    const up = normalizeUpstreamSentiment(a.sentiment)
    const score = up ? up.score : lexiconScore(`${a.title}. ${a.summary}`)
    const label = up ? up.label : labelForScore(score)
    return {
      ...a,
      sentimentScore: Math.round(score * 1000) / 1000,
      sentimentLabel: label,
      sentimentMethod: up ? 'upstream' : 'lexicon',
    }
  })

  return NextResponse.json({ articles: withSentiment, total: withSentiment.length, sources })
}

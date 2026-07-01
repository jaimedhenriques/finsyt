import { NextRequest, NextResponse } from 'next/server'
import { getCompanySentiment, getSectorSentiment, listSectors } from '@/lib/news-sentiment'
import { sentimentResponseSchema } from '@/lib/news-sentiment-core'

export const dynamic = 'force-dynamic'

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/

/**
 * GET /api/news/sentiment?symbol=NVDA[&days=30][&llm=0]
 * GET /api/news/sentiment?sector=semiconductors[&days=30]
 *
 * Returns a daily sentiment + volume series with a trailing-baseline
 * deviation verdict. LLM scoring is bounded and cached; pass `llm=0` to skip
 * it and use only upstream/lexicon scores (faster, free).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams
  const symbolRaw = sp.get('symbol')?.toUpperCase().trim()
  const sectorRaw = sp.get('sector')?.toLowerCase().trim()
  const days = parseInt(sp.get('days') || '30', 10)
  const useLLM = sp.get('llm') !== '0'

  try {
    let snapshot
    if (symbolRaw) {
      if (!SYMBOL_RE.test(symbolRaw)) {
        return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 })
      }
      snapshot = await getCompanySentiment(symbolRaw, { days, useLLM })
    } else if (sectorRaw) {
      snapshot = await getSectorSentiment(sectorRaw, { days, useLLM })
      if (!snapshot) {
        return NextResponse.json(
          { error: 'Unknown sector', sectors: listSectors() },
          { status: 400 },
        )
      }
    } else {
      return NextResponse.json(
        { error: 'Provide a symbol or sector', sectors: listSectors() },
        { status: 400 },
      )
    }

    const parsed = sentimentResponseSchema.safeParse(snapshot)
    if (!parsed.success) {
      console.error('[news/sentiment] response failed schema', parsed.error.issues.slice(0, 3))
      return NextResponse.json({ error: 'Internal serialisation error' }, { status: 500 })
    }
    return NextResponse.json(parsed.data)
  } catch (e) {
    console.error('[news/sentiment] failed:', (e as Error).message)
    return NextResponse.json({ error: 'Failed to compute sentiment' }, { status: 500 })
  }
}

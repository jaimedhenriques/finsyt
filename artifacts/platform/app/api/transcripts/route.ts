import { NextRequest, NextResponse } from 'next/server'
import { buildRealDeck } from '@/lib/slide-decks'
import { loadAlignedTranscript } from '@/lib/transcripts-server'
import { requireFeature } from '@/lib/billing-server'

const FMP = process.env.FMP_API_KEY

interface FmpTranscriptListEntry { 0?: number; 1?: number; 2?: string }

export async function GET(req: NextRequest) {
  const gate = await requireFeature('transcripts')
  if (!gate.ok) return gate.response!
  const symbol  = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const year    = req.nextUrl.searchParams.get('year') || ''
  const quarter = req.nextUrl.searchParams.get('quarter') || ''
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  try {
    // Get list of available transcripts
    if (!year) {
      const res = await fetch(`https://financialmodelingprep.com/api/v4/earning_call_transcript?symbol=${symbol}&apikey=${FMP}`)
      const data = await res.json()
      const transcripts = (Array.isArray(data) ? data : []).map((t: FmpTranscriptListEntry) => ({
        symbol, year: t[0], quarter: t[1], date: t[2],
        title: `${symbol} Q${t[1]} ${t[0]} Earnings Call`,
      }))
      return NextResponse.json({ transcripts })
    }

    // Aligned-or-estimated transcript payload (shared with the live event
    // SSE route — see lib/transcripts-server.ts).
    const tx = await loadAlignedTranscript(symbol, year, quarter)
    if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Slide deck. We build the deck from the company's actual reported
    // financials for this exact (symbol, year, quarter) — revenue, margins,
    // cash flow, balance sheet — so each call shows that company's real
    // numbers rather than a hard-coded template. `deckPageUrl` points at
    // the issuer's IR page where the official PDF deck is published.
    //
    // FMP does not publish slide-deck timings, so we evenly distribute
    // anchor times across the prepared-remarks portion of the call (intro
    // ≈3%, last slide ≈70%, since Q&A rarely advances slides). The shape
    // matches what a future deck-alignment pipeline would emit, so the
    // SlidesViewer contract stays stable when real timings are wired in.
    const { slides: deckSlides, deckSource, deckPageUrl, deckPdfUrl } = await buildRealDeck(symbol, tx.year, tx.quarter, tx.date)
    const introSec = tx.totalDurationSec * 0.03
    const lastSlideSec = tx.totalDurationSec * 0.70
    const span = Math.max(0, lastSlideSec - introSec)
    const step = deckSlides.length > 1 ? span / (deckSlides.length - 1) : 0
    const slides = deckSlides.map((s, i) => ({
      ...s,
      startSec: +(introSec + step * i).toFixed(2),
    }))
    const slideTimingSource: 'estimated' | 'aligned' = 'estimated'

    return NextResponse.json({
      symbol:           tx.symbol,
      year:             tx.year,
      quarter:          tx.quarter,
      date:             tx.date,
      title:            tx.title,
      audioUrl:         tx.audioUrl,
      audioAvailable:   tx.audioAvailable,
      timingSource:     tx.timingSource,
      totalDurationSec: tx.totalDurationSec,
      slides,
      slideTimingSource,
      deckSource,
      deckPageUrl,
      deckPdfUrl,
      paragraphs:       tx.paragraphs,
      segments:         tx.segments.slice(0, 60),
      content:          tx.content,
    })
  } catch (e) {
    return NextResponse.json({ error: 'Failed', detail: String(e) }, { status: 500 })
  }
}

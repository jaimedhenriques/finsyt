import { NextRequest, NextResponse } from 'next/server'
import { getCachedAlignment, ensureAlignmentJob, AlignmentResult } from '@/lib/transcript-alignment'
import { buildRealDeck } from '@/lib/slide-decks'
const FMP = process.env.FMP_API_KEY

const SPEAKER_GAP_SEC = 1.4

// Returns the configured audio URL for this call, or null if no real audio
// source is wired in. We deliberately do NOT fall back to placeholder /
// unrelated audio — the player falls back to silent timed playback so the
// synced transcript still works without misrepresenting the audio.
//
// Configuration paths (see docs/transcript-audio.md):
//   1. Self-hosted MP3s — set TRANSCRIPT_AUDIO_BASE_URL to a directory of
//      files named {SYMBOL}_{YEAR}_Q{QUARTER}.mp3.
//   2. Vendor feed (Quartr / Earnings Call Pro / S&P Capital IQ / etc.) —
//      replace the body of this function with a vendor-catalog lookup.
//      Keep the (symbol, year, quarter) => string | null signature so the
//      response contract and player do not change.
function audioUrlFor(symbol: string, year: string | number, quarter: string | number): string | null {
  const base = process.env.TRANSCRIPT_AUDIO_BASE_URL || process.env.NEXT_PUBLIC_TRANSCRIPT_AUDIO_BASE
  if (!base) return null
  return `${base.replace(/\/$/, '')}/${symbol}_${year}_Q${quarter}.mp3`
}

function classifyRole(speaker: string): string {
  const s = speaker.toLowerCase()
  if (s.includes('operator')) return 'Operator'
  // FMP often formats analysts as "Name -- Firm" or "Name - Firm"
  const dashMatch = speaker.match(/[-–—]{1,2}\s*(.+)$/)
  if (dashMatch) return `Analyst — ${dashMatch[1].trim()}`
  if (s.includes('chief executive') || s.endsWith(' ceo')) return 'CEO'
  if (s.includes('chief financial') || s.endsWith(' cfo')) return 'CFO'
  if (s.includes('investor relations') || s.includes(' ir ')) return 'IR'
  return 'Executive'
}

function cleanSpeaker(speaker: string): string {
  // Strip "-- Firm" / "- Firm" suffixes for display
  return speaker.replace(/\s*[-–—]{1,2}\s*.+$/, '').trim()
}

export async function GET(req: NextRequest) {
  const symbol  = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const year    = req.nextUrl.searchParams.get('year') || ''
  const quarter = req.nextUrl.searchParams.get('quarter') || ''
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  try {
    // Get list of available transcripts
    if (!year) {
      const res = await fetch(`https://financialmodelingprep.com/api/v4/earning_call_transcript?symbol=${symbol}&apikey=${FMP}`)
      const data = await res.json()
      const transcripts = (Array.isArray(data) ? data : []).map((t: any) => ({
        symbol, year: t[0], quarter: t[1], date: t[2],
        title: `${symbol} Q${t[1]} ${t[0]} Earnings Call`,
      }))
      return NextResponse.json({ transcripts })
    }

    // Get specific transcript
    const res = await fetch(`https://financialmodelingprep.com/api/v3/earning_call_transcript/${symbol}?year=${year}&quarter=${quarter}&apikey=${FMP}`)
    const data = await res.json()
    const transcript = Array.isArray(data) ? data[0] : data
    if (!transcript) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Parse into speaker segments
    const content = transcript.content || ''
    const lines = content.split('\n').filter((l: string) => l.trim())
    const segments: { speaker: string; role: string; text: string }[] = []
    let currentSpeaker = ''
    let currentText: string[] = []

    const flush = () => {
      if (currentSpeaker && currentText.length > 0) {
        segments.push({
          speaker: cleanSpeaker(currentSpeaker),
          role: classifyRole(currentSpeaker),
          text: currentText.join(' ').trim(),
        })
      }
    }

    lines.forEach((line: string) => {
      const speakerMatch = line.match(/^([A-Z][^:]{2,80}):\s*(.*)$/)
      if (speakerMatch) {
        flush()
        currentSpeaker = speakerMatch[1]
        currentText = speakerMatch[2] ? [speakerMatch[2]] : []
      } else {
        currentText.push(line)
      }
    })
    flush()

    // Build per-word timing payload. We prefer real forced-alignment
    // (timings derived from the audio itself) when an STT provider is
    // configured AND we have an audio URL. Otherwise we fall back to
    // estimating from average speaking rate. Both paths produce the
    // same `words: [{text,startSec,endSec}]` shape so the UI contract
    // is stable. `timingSource` advertises which mode produced the data.
    const url = audioUrlFor(symbol, transcript.year, transcript.quarter)
    // Forced-alignment (Deepgram / AssemblyAI) is intentionally off the
    // request path: STT can take many seconds and would 504 on serverless.
    // We synchronously consult the cache and, on a miss, kick off a
    // background job whose result lands in the cache for the next request.
    // The first request returns estimated timings; subsequent requests for
    // the same call return real, audio-anchored timings.
    let aligned: AlignmentResult | null = null
    if (url) {
      const key = `${symbol}_${transcript.year}_Q${transcript.quarter}`
      aligned = getCachedAlignment(key, segments)
      if (!aligned) ensureAlignmentJob(key, url, segments)
    }

    let cursor = 0
    const paragraphs = segments.map((s, idx) => {
      const tokens = s.text.split(/\s+/).filter(Boolean)
      if (aligned && aligned.paragraphs[idx] && aligned.paragraphs[idx].words.length) {
        const ap = aligned.paragraphs[idx]
        const startSec = ap.words[0].startSec
        const endSec = ap.words[ap.words.length - 1].endSec
        return {
          ...s,
          startSec: +startSec.toFixed(2),
          durationSec: +Math.max(0.5, endSec - startSec).toFixed(2),
          words: ap.words,
          timingSource: ap.timingSource,
        }
      }
      const startSec = cursor
      const words = tokens.map(t => {
        const wDur = Math.max(0.18, t.length / 12)
        const wStart = cursor
        cursor += wDur
        return { text: t, startSec: +wStart.toFixed(2), endSec: +cursor.toFixed(2), matched: false }
      })
      const durationSec = Math.max(0.5, cursor - startSec)
      cursor += SPEAKER_GAP_SEC
      return {
        ...s,
        startSec: +startSec.toFixed(2),
        durationSec: +durationSec.toFixed(2),
        words,
        timingSource: 'estimated' as const,
      }
    })
    const totalDurationSec = aligned?.totalDurationSec ?? Math.max(60, Math.round(cursor))
    const timingSource: 'aligned' | 'mixed' | 'estimated' = aligned?.timingSource ?? 'estimated'

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
    // Prefer the requested year/quarter (URL params) — FMP's transcript v3
    // payload doesn't always echo them back as top-level fields.
    const callYear    = transcript.year    ?? year
    const callQuarter = transcript.quarter ?? quarter
    const { slides: deckSlides, deckSource, deckPageUrl, deckPdfUrl } = await buildRealDeck(symbol, callYear, callQuarter, transcript.date)
    const introSec = totalDurationSec * 0.03
    const lastSlideSec = totalDurationSec * 0.70
    const span = Math.max(0, lastSlideSec - introSec)
    const step = deckSlides.length > 1 ? span / (deckSlides.length - 1) : 0
    const slides = deckSlides.map((s, i) => ({
      ...s,
      startSec: +(introSec + step * i).toFixed(2),
    }))
    const slideTimingSource: 'estimated' | 'aligned' = 'estimated'

    return NextResponse.json({
      symbol,
      year:     transcript.year,
      quarter:  transcript.quarter,
      date:     transcript.date,
      title:    `${symbol} Q${transcript.quarter} ${transcript.year} Earnings Call`,
      audioUrl: url,
      audioAvailable: !!url,
      timingSource,
      totalDurationSec,
      slides,
      slideTimingSource,
      deckSource,
      deckPageUrl,
      deckPdfUrl,
      paragraphs,
      segments: segments.slice(0, 60),
      content,
    })
  } catch (e) {
    return NextResponse.json({ error: 'Failed', detail: String(e) }, { status: 500 })
  }
}

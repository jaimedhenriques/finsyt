// Server-only helpers for assembling the post-call aligned transcript
// payload. Used by `/api/transcripts` (the public surface) and by the live
// event SSE route (`/api/live-events/[id]/transcript`) for the aligned
// hand-over — calling this directly avoids an internal authenticated HTTP
// roundtrip back through middleware.

import { getCachedAlignment, ensureAlignmentJob, type AlignmentResult } from './transcript-alignment'

const FMP = process.env.FMP_API_KEY
const SPEAKER_GAP_SEC = 1.4

export type TimingSource = 'aligned' | 'mixed' | 'estimated'

export interface ParagraphWord { text: string; startSec: number; endSec: number; matched?: boolean }
export interface AlignedTranscriptParagraph {
  speaker: string
  role: string
  text: string
  startSec: number
  durationSec?: number
  words?: ParagraphWord[]
  timingSource?: TimingSource
}

export interface AlignedTranscriptResult {
  symbol: string
  year: string | number
  quarter: string | number
  date?: string
  title: string
  audioUrl: string | null
  audioAvailable: boolean
  totalDurationSec: number
  timingSource: TimingSource
  paragraphs: AlignedTranscriptParagraph[]
  segments: { speaker: string; role: string; text: string }[]
  content: string
}

function audioUrlFor(symbol: string, year: string | number, quarter: string | number): string | null {
  const base = process.env.TRANSCRIPT_AUDIO_BASE_URL || process.env.NEXT_PUBLIC_TRANSCRIPT_AUDIO_BASE
  if (!base) return null
  return `${base.replace(/\/$/, '')}/${symbol}_${year}_Q${quarter}.mp3`
}

function classifyRole(speaker: string): string {
  const s = speaker.toLowerCase()
  if (s.includes('operator')) return 'Operator'
  const dashMatch = speaker.match(/[-–—]{1,2}\s*(.+)$/)
  if (dashMatch) return `Analyst — ${dashMatch[1].trim()}`
  if (s.includes('chief executive') || s.endsWith(' ceo')) return 'CEO'
  if (s.includes('chief financial') || s.endsWith(' cfo')) return 'CFO'
  if (s.includes('investor relations') || s.includes(' ir ')) return 'IR'
  return 'Executive'
}

function cleanSpeaker(speaker: string): string {
  return speaker.replace(/\s*[-–—]{1,2}\s*.+$/, '').trim()
}

interface FmpTranscript {
  symbol?: string
  year?: number | string
  quarter?: number | string
  date?: string
  content?: string
}

// Fetch + assemble the aligned-or-estimated transcript payload for a single
// (symbol, year, quarter). Returns null when FMP has no transcript for that
// call (e.g. live call hasn't been published yet).
export async function loadAlignedTranscript(
  symbol: string,
  year: string | number,
  quarter: string | number,
): Promise<AlignedTranscriptResult | null> {
  if (!symbol || !year || !quarter) return null

  const url = `https://financialmodelingprep.com/api/v3/earning_call_transcript/${symbol}?year=${year}&quarter=${quarter}&apikey=${FMP}`
  let transcript: FmpTranscript | null = null
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    transcript = Array.isArray(data) ? data[0] : data
  } catch {
    return null
  }
  if (!transcript || !transcript.content) return null

  const content = transcript.content
  const lines = content.split('\n').filter(l => l.trim())
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
  for (const line of lines) {
    const m = line.match(/^([A-Z][^:]{2,80}):\s*(.*)$/)
    if (m) {
      flush()
      currentSpeaker = m[1]!
      currentText = m[2] ? [m[2]] : []
    } else {
      currentText.push(line)
    }
  }
  flush()

  const callYear    = transcript.year    ?? year
  const callQuarter = transcript.quarter ?? quarter
  const audioUrl = audioUrlFor(symbol, callYear, callQuarter)

  let aligned: AlignmentResult | null = null
  if (audioUrl) {
    const key = `${symbol}_${callYear}_Q${callQuarter}`
    aligned = getCachedAlignment(key, segments)
    if (!aligned) ensureAlignmentJob(key, audioUrl, segments)
  }

  let cursor = 0
  const paragraphs: AlignedTranscriptParagraph[] = segments.map((s, idx) => {
    const tokens = s.text.split(/\s+/).filter(Boolean)
    if (aligned && aligned.paragraphs[idx] && aligned.paragraphs[idx]!.words.length) {
      const ap = aligned.paragraphs[idx]!
      const startSec = ap.words[0]!.startSec
      const endSec = ap.words[ap.words.length - 1]!.endSec
      return {
        ...s,
        startSec: +startSec.toFixed(2),
        durationSec: +Math.max(0.5, endSec - startSec).toFixed(2),
        words: ap.words,
        timingSource: ap.timingSource,
      }
    }
    const startSec = cursor
    const words: ParagraphWord[] = tokens.map(t => {
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
      timingSource: 'estimated',
    }
  })
  const totalDurationSec = aligned?.totalDurationSec ?? Math.max(60, Math.round(cursor))
  const timingSource: TimingSource = aligned?.timingSource ?? 'estimated'

  return {
    symbol,
    year: callYear,
    quarter: callQuarter,
    date: transcript.date,
    title: `${symbol} Q${callQuarter} ${callYear} Earnings Call`,
    audioUrl,
    audioAvailable: !!audioUrl,
    totalDurationSec,
    timingSource,
    paragraphs,
    segments,
    content,
  }
}

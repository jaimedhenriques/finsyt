// Forced-alignment / speech-to-text helpers for transcript word timing.
//
// FMP only ships transcript text, never word-level timestamps. To get a tight
// karaoke-style highlight in the player we send the call's audio URL to a
// hosted STT service (Deepgram preferred, AssemblyAI as fallback) and align
// the returned word stream onto our speaker-segmented paragraphs.
//
// The alignment uses a sliding sequential matcher with n-gram anchor-recovery
// to stay robust across long calls where the FMP transcript and STT output
// diverge (filler words, mis-heard names, missing analyst boilerplate).
// Unmatched words are linearly interpolated between the two nearest matched
// STT anchors so they still derive from real audio positions, never from
// synthesized speaking-rate guesses, whenever STT is available.
//
// IMPORTANT: STT calls can take many seconds. To keep the transcript API
// responsive, the request path must NOT await alignment — call
// `getCachedAlignment(key)` for a synchronous read and `ensureAlignmentJob(...)`
// to kick off a background job. The first request returns estimated timings;
// subsequent requests (after the job lands) return real aligned timings.
//
// `timingSource` is reported per-paragraph as `aligned` (every word matched
// directly to STT), `mixed` (some words interpolated between real anchors)
// or `estimated` (no STT anchors at all — fallback to speaking-rate guess).
// The top-level value is `aligned` only if every paragraph is fully aligned.

export interface AlignedWord {
  text: string
  startSec: number
  endSec: number
  // True only for words whose timestamps come straight from the STT vendor.
  // Interpolated words sit between two real STT anchors and are accurate to
  // within a small fraction of the gap.
  matched: boolean
}

export type ParagraphTimingSource = 'aligned' | 'mixed' | 'estimated'

export interface AlignmentResult {
  paragraphs: { words: AlignedWord[]; timingSource: ParagraphTimingSource }[]
  totalDurationSec: number
  timingSource: ParagraphTimingSource
}

import { promises as fs } from 'node:fs'
import * as fsSync from 'node:fs'
import path from 'node:path'

interface SttWord { word: string; start: number; end: number }

interface CacheEntry {
  ts: number
  // Aligned result keyed by paragraph layout hash. We re-compute alignment
  // when the paragraph segmentation changes (e.g. FMP republishes the call)
  // even if the underlying STT word stream is still cached.
  byLayout: Map<string, AlignmentResult | null>
  // Raw STT word stream — re-used across layout hashes for the same call.
  stt: SttWord[] | null
}
const CACHE_TTL_MS = 1000 * 60 * 60 * 12 // 12h
const cache = new Map<string, CacheEntry>()
// In-flight jobs (deduped by cache key) so concurrent requests don't fan
// out multiple STT calls for the same call.
const inFlight = new Map<string, Promise<void>>()

// Disk-backed cache so aligned timings survive server restarts (mirrors the
// pattern used by lib/question-clusters.ts). Best-effort: filesystem errors
// are swallowed and the in-memory cache still works.
const CACHE_DIR = path.join(process.cwd(), '.cache', 'transcript-alignment')
function safeName(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 120)
}
async function ensureCacheDir(): Promise<void> {
  try { await fs.mkdir(CACHE_DIR, { recursive: true }) } catch { /* ignore */ }
}
interface DiskEnvelope { ts: number; stt: SttWord[] | null }
async function diskRead(key: string): Promise<DiskEnvelope | null> {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${safeName(key)}.json`), 'utf-8')
    const env = JSON.parse(raw) as DiskEnvelope
    if (Date.now() - env.ts > CACHE_TTL_MS) return null
    return env
  } catch { return null }
}
async function diskWrite(key: string, env: DiskEnvelope): Promise<void> {
  try {
    await ensureCacheDir()
    await fs.writeFile(path.join(CACHE_DIR, `${safeName(key)}.json`), JSON.stringify(env), 'utf-8')
  } catch { /* best-effort */ }
}
function diskReadSync(key: string): DiskEnvelope | null {
  try {
    // Use sync FS only on the synchronous read path so the route stays
    // non-blocking on the (common) cached case. node:fs is fine here.
    const raw = fsSync.readFileSync(path.join(CACHE_DIR, `${safeName(key)}.json`), 'utf-8')
    const env = JSON.parse(raw) as DiskEnvelope
    if (Date.now() - env.ts > CACHE_TTL_MS) return null
    return env
  } catch { return null }
}

const DEEPGRAM_TIMEOUT_MS = 60_000
const ASSEMBLY_SUBMIT_TIMEOUT_MS = 15_000
const ASSEMBLY_POLL_TIMEOUT_MS   = 10_000
const ASSEMBLY_BUDGET_MS         = 180_000

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function layoutHash(paragraphs: { text: string }[]): string {
  // Cheap, stable hash of (segment count + per-segment word count) so the
  // cache invalidates if FMP re-segments the call.
  const parts: string[] = []
  for (const p of paragraphs) parts.push(String(p.text.split(/\s+/).filter(Boolean).length))
  return `${paragraphs.length}:${parts.join(',')}`
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

interface DgWord { punctuated_word?: string; word?: string; start?: number; end?: number }
interface DgResponse {
  results?: { channels?: { alternatives?: { words?: DgWord[] }[] }[] }
}
async function transcribeDeepgram(audioUrl: string): Promise<SttWord[] | null> {
  const key = process.env.DEEPGRAM_API_KEY
  if (!key) return null
  const res = await fetchWithTimeout(
    'https://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&smart_format=true',
    {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: audioUrl }),
    },
    DEEPGRAM_TIMEOUT_MS,
  )
  if (!res.ok) throw new Error(`deepgram ${res.status}`)
  const data = (await res.json()) as DgResponse
  const words = data?.results?.channels?.[0]?.alternatives?.[0]?.words
  if (!Array.isArray(words)) return null
  return words.map((w): SttWord => ({
    word:  String(w.punctuated_word ?? w.word ?? ''),
    start: Number(w.start) || 0,
    end:   Number(w.end)   || 0,
  })).filter(w => w.word)
}

interface AaiSubmit { id?: string }
interface AaiPoll { status?: string; error?: string; words?: { text?: string; start?: number; end?: number }[] }
async function transcribeAssemblyAi(audioUrl: string, deadline: number): Promise<SttWord[] | null> {
  const key = process.env.ASSEMBLYAI_API_KEY
  if (!key) return null
  const submit = await fetchWithTimeout('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_url: audioUrl }),
  }, ASSEMBLY_SUBMIT_TIMEOUT_MS)
  if (!submit.ok) throw new Error(`assemblyai submit ${submit.status}`)
  const submitted = (await submit.json()) as AaiSubmit
  const id = submitted?.id
  if (!id) return null
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000))
    const poll = await fetchWithTimeout(
      `https://api.assemblyai.com/v2/transcript/${id}`,
      { headers: { Authorization: key } },
      ASSEMBLY_POLL_TIMEOUT_MS,
    )
    if (!poll.ok) throw new Error(`assemblyai poll ${poll.status}`)
    const got = (await poll.json()) as AaiPoll
    if (got?.status === 'completed') {
      const words = got?.words
      if (!Array.isArray(words)) return null
      return words.map((w): SttWord => ({
        word:  String(w.text ?? ''),
        start: (Number(w.start) || 0) / 1000,
        end:   (Number(w.end)   || 0) / 1000,
      })).filter(w => w.word)
    }
    if (got?.status === 'error') throw new Error(`assemblyai error: ${got?.error || 'unknown'}`)
  }
  return null
}

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

interface MatchedAnchor { pIdx: number; wIdx: number; sttIdx: number }

// Build a global sequence of matched (paragraph word -> STT word) anchors.
// For each FMP token, try a normalized match within a small look-ahead
// window in STT. After STUCK_RUN consecutive misses, scan ahead up to
// RECOVERY_WINDOW for a 3-gram of upcoming FMP tokens and jump to it. This
// keeps drift bounded across long calls where text and audio diverge.
function buildAnchors(paragraphTokens: string[][], stt: SttWord[]): MatchedAnchor[] {
  const LOOK_AHEAD = 16
  const STUCK_RUN = 8
  const RECOVERY_WINDOW = 600
  const anchors: MatchedAnchor[] = []
  let sttIdx = 0
  let stuck = 0

  for (let pIdx = 0; pIdx < paragraphTokens.length; pIdx++) {
    const toks = paragraphTokens[pIdx]
    for (let wIdx = 0; wIdx < toks.length; wIdx++) {
      const t = norm(toks[wIdx])
      if (!t) continue

      let found = -1
      const cap = Math.min(stt.length, sttIdx + LOOK_AHEAD)
      for (let j = sttIdx; j < cap; j++) {
        if (norm(stt[j].word) === t) { found = j; break }
      }
      if (found >= 0) {
        anchors.push({ pIdx, wIdx, sttIdx: found })
        sttIdx = found + 1
        stuck = 0
        continue
      }

      stuck++
      if (stuck >= STUCK_RUN) {
        const ngram: string[] = []
        for (let k = wIdx; k < toks.length && ngram.length < 3; k++) {
          const n = norm(toks[k]); if (n) ngram.push(n)
        }
        if (ngram.length === 3) {
          const cap2 = Math.min(stt.length, sttIdx + RECOVERY_WINDOW)
          for (let j = sttIdx; j < cap2 - 2; j++) {
            if (
              norm(stt[j].word)     === ngram[0] &&
              norm(stt[j + 1].word) === ngram[1] &&
              norm(stt[j + 2].word) === ngram[2]
            ) {
              anchors.push({ pIdx, wIdx, sttIdx: j })
              sttIdx = j + 1
              stuck = 0
              break
            }
          }
        }
      }
    }
  }
  return anchors
}

function alignParagraphs(paragraphs: { text: string }[], stt: SttWord[]): AlignmentResult {
  const paragraphTokens = paragraphs.map(p => p.text.split(/\s+/).filter(Boolean))
  const anchors = buildAnchors(paragraphTokens, stt)
  const anchorsByParagraph: MatchedAnchor[][] = paragraphs.map(() => [])
  for (const a of anchors) anchorsByParagraph[a.pIdx].push(a)

  const out: { words: AlignedWord[]; timingSource: ParagraphTimingSource }[] = []
  let prevAnchorEnd = 0

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const toks = paragraphTokens[pIdx]
    const pAnchors = anchorsByParagraph[pIdx]
    const words: AlignedWord[] = []

    if (pAnchors.length === 0) {
      // No anchors at all: bound this paragraph between the previous anchor
      // end and the next paragraph's first anchor (or +small slice).
      let nextStart: number | null = null
      for (let q = pIdx + 1; q < paragraphs.length; q++) {
        if (anchorsByParagraph[q].length > 0) {
          nextStart = stt[anchorsByParagraph[q][0].sttIdx].start
          break
        }
      }
      const span = nextStart != null
        ? Math.max(0.5, nextStart - prevAnchorEnd)
        : Math.max(0.5, toks.length * 0.35)
      const per = toks.length > 0 ? span / toks.length : 0
      let cur = prevAnchorEnd
      for (const t of toks) {
        const start = cur
        cur += Math.max(0.18, per)
        words.push({ text: t, startSec: +start.toFixed(2), endSec: +cur.toFixed(2), matched: false })
      }
      out.push({ words, timingSource: 'estimated' })
      if (words.length) prevAnchorEnd = words[words.length - 1].endSec
      continue
    }

    function emitInterpolated(from: number, toExclusive: number, t0: number, t1: number) {
      const n = toExclusive - from
      if (n <= 0) return
      const dt = Math.max(0.01, t1 - t0) / (n + 1)
      for (let k = 0; k < n; k++) {
        const start = t0 + dt * (k + 1)
        const end = start + dt
        words.push({
          text: toks[from + k],
          startSec: +start.toFixed(2),
          endSec: +Math.min(t1, end).toFixed(2),
          matched: false,
        })
      }
    }

    let cursor = 0
    let aIdx = 0
    let lastRealEnd = prevAnchorEnd
    while (cursor < toks.length) {
      const nextA = pAnchors[aIdx]
      if (nextA && nextA.wIdx === cursor) {
        const sw = stt[nextA.sttIdx]
        words.push({
          text: toks[cursor],
          startSec: +sw.start.toFixed(2),
          endSec: +sw.end.toFixed(2),
          matched: true,
        })
        lastRealEnd = sw.end
        cursor++; aIdx++
      } else if (nextA && nextA.wIdx > cursor) {
        const sw = stt[nextA.sttIdx]
        emitInterpolated(cursor, nextA.wIdx, lastRealEnd, sw.start)
        cursor = nextA.wIdx
      } else {
        // Tail: between lastRealEnd and the next paragraph's first anchor.
        let tailEnd = lastRealEnd + Math.max(0.5, (toks.length - cursor) * 0.35)
        for (let q = pIdx + 1; q < paragraphs.length; q++) {
          if (anchorsByParagraph[q].length > 0) {
            tailEnd = stt[anchorsByParagraph[q][0].sttIdx].start
            break
          }
        }
        emitInterpolated(cursor, toks.length, lastRealEnd, tailEnd)
        cursor = toks.length
      }
    }

    const totalMatched = words.reduce((n, w) => n + (w.matched ? 1 : 0), 0)
    const timingSource: ParagraphTimingSource =
      totalMatched === words.length ? 'aligned'
      : totalMatched === 0          ? 'estimated'
      :                               'mixed'
    out.push({ words, timingSource })
    if (words.length) prevAnchorEnd = words[words.length - 1].endSec
  }

  let topAligned = true
  let anyAnchor = false
  for (const p of out) {
    if (p.timingSource !== 'aligned') topAligned = false
    if (p.timingSource !== 'estimated') anyAnchor = true
  }
  const top: ParagraphTimingSource =
    topAligned ? 'aligned' : (anyAnchor ? 'mixed' : 'estimated')

  const totalDurationSec = stt.length
    ? Math.max(60, Math.round(stt[stt.length - 1].end + 2))
    : 60

  return { paragraphs: out, totalDurationSec, timingSource: top }
}

// ---------------------------------------------------------------------------
// Public API: synchronous cache read + background job kick-off
// ---------------------------------------------------------------------------

export function getCachedAlignment(
  cacheKey: string,
  paragraphs: { text: string }[],
): AlignmentResult | null {
  let entry = cache.get(cacheKey)
  // Hydrate from disk on first read (sync; only fires on cold start).
  if (!entry || Date.now() - entry.ts > CACHE_TTL_MS) {
    const disk = diskReadSync(cacheKey)
    if (disk) {
      entry = { ts: disk.ts, byLayout: new Map(), stt: disk.stt }
      cache.set(cacheKey, entry)
    }
  }
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null
  const layout = layoutHash(paragraphs)
  if (entry.byLayout.has(layout)) return entry.byLayout.get(layout) ?? null
  // We have STT cached but not yet aligned to this paragraph layout — align
  // now (pure CPU, fast) and cache.
  if (entry.stt) {
    const result = alignParagraphs(paragraphs, entry.stt)
    entry.byLayout.set(layout, result)
    return result
  }
  return null
}

// Kick off a background STT + alignment job for this call. Safe to call on
// every request — concurrent calls share a single in-flight promise. Returns
// immediately; the result lands in the cache for the next request.
export function ensureAlignmentJob(
  cacheKey: string,
  audioUrl: string,
  paragraphs: { text: string }[],
): void {
  if (!process.env.DEEPGRAM_API_KEY && !process.env.ASSEMBLYAI_API_KEY) return
  const layout = layoutHash(paragraphs)
  const entry = cache.get(cacheKey)
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS && entry.byLayout.has(layout)) return
  if (inFlight.has(cacheKey)) return

  const job = (async () => {
    let stt: SttWord[] | null = entry?.stt ?? null
    if (!stt) {
      // Try disk first so a restarted process doesn't re-bill the vendor.
      const disk = await diskRead(cacheKey)
      if (disk?.stt) stt = disk.stt
    }
    if (!stt) {
      try {
        stt = await transcribeDeepgram(audioUrl)
        if (!stt) {
          const deadline = Date.now() + ASSEMBLY_BUDGET_MS
          stt = await transcribeAssemblyAi(audioUrl, deadline)
        }
      } catch (e) {
        console.warn('[transcript-alignment] STT failed:', (e as Error).message)
        stt = null
      }
    }
    const result = stt ? alignParagraphs(paragraphs, stt) : null
    const e = cache.get(cacheKey) ?? { ts: Date.now(), byLayout: new Map(), stt: null }
    e.ts = Date.now()
    e.stt = stt
    e.byLayout.set(layout, result)
    cache.set(cacheKey, e)
    if (stt) await diskWrite(cacheKey, { ts: e.ts, stt })
  })().finally(() => { inFlight.delete(cacheKey) })

  inFlight.set(cacheKey, job)
}

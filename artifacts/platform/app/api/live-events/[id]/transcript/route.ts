import { NextRequest } from 'next/server'
import { findLiveEventById, type LiveEvent } from '@/lib/live-events'
import {
  getCachedStt,
  ensureAlignmentJob,
  type CachedSttWord,
} from '@/lib/transcript-alignment'
import { loadAlignedTranscript, type AlignedTranscriptResult } from '@/lib/transcripts-server'
import { openLiveDeepgramStream, type StreamingHandle } from '@/lib/streaming-stt'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Server-Sent Events stream for the live transcript pane.
//
// Event types emitted on the SSE channel:
//   • `meta`       — the LiveEvent metadata (sent once on connection so the
//                    client can render its header).
//   • `partial`    — { text, speaker?, ts } — interim caption fragment.
//   • `final`      — { text, speaker?, ts } — finalized caption line.
//   • `status`     — { state: 'no-stream' | 'connecting' | 'live' | 'ended',
//                       reason?: string }
//   • `aligned`    — payload identical to `/api/transcripts` for the same
//                    (symbol, year, quarter). Earnings only — emitted exactly
//                    once when the post-call alignment lands. Clients then
//                    swap to the SyncedTranscript view; the live caption pane
//                    stops.
//   • `heartbeat`  — keep-alive every 15s so proxies don't sever the
//                    connection during quiet stretches.
//
// Live captions are produced from a real-time Deepgram WebSocket stream
// (`lib/streaming-stt.ts`). Both interim (`partial`) and finalized (`final`)
// fragments are forwarded to the client as Deepgram emits them — the client
// is expected to render `partial` chunks as a tentative tail and replace
// them when the matching `final` arrives.
//
// As a fallback (no streaming session running yet, e.g. cold start where the
// audio pump hasn't connected), we tail the cached batch-STT word stream
// produced by `lib/transcript-alignment.ts` and emit it as `final` chunks.
// This way the user always sees something whenever STT data exists.
//
// Earnings calls additionally get a paragraph-aligned `aligned` payload once
// the post-call layout exists; for CMDs and investor conferences (no
// canonical paragraph layout) we keep streaming captions until the call
// ends or the upstream stream signals completion.

const HEARTBEAT_MS = 15_000
const ALIGN_POLL_MS = 5_000
// Cap on a single SSE connection; browsers auto-reconnect on close. Also
// enforces fresh polling on long sessions.
const MAX_STREAM_MS = 5 * 60 * 1000

// Caption chunking off the raw STT timeline.
const CAPTION_MIN_WORDS = 8
const CAPTION_MAX_WORDS = 18
// Emit a chunk early when the gap to the next word exceeds this — natural
// pause / sentence boundary heuristic.
const CAPTION_GAP_SEC = 1.2

function sseEncode(eventName: string, data: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
}

// Cache key used for STT + alignment storage. Earnings keep their canonical
// {SYMBOL}_{YEAR}_Q{QUARTER} key (so post-call alignment lines up with the
// transcripts route); other event types use a stable per-event key.
function cacheKeyFor(event: LiveEvent): string {
  if (event.type === 'earnings' && event.year && event.quarter) {
    return `${event.symbol}_${event.year}_Q${event.quarter}`
  }
  return `live_${event.id}`
}

// Probe for the post-call aligned transcript payload. Calls the shared
// server-only loader directly (no internal HTTP roundtrip — avoids needing
// to forward auth cookies to a middleware-protected internal route).
// Only returns a payload once forced-alignment timings are available;
// estimated-only payloads stay null so we keep streaming live captions
// instead of swapping to placeholder timings.
async function fetchAlignedPayload(event: LiveEvent): Promise<AlignedTranscriptResult | null> {
  if (event.type !== 'earnings' || !event.year || !event.quarter) return null
  const tx = await loadAlignedTranscript(event.symbol, event.year, event.quarter)
  if (!tx) return null
  if (tx.timingSource !== 'aligned' && tx.timingSource !== 'mixed') return null
  return tx
}

// Group the raw STT timeline into caption-sized chunks. Returns chunks for
// indices ≥ startIdx, plus the new boundary (last index consumed + 1).
function chunkCaptions(stt: CachedSttWord[], startIdx: number): { chunks: { text: string; startSec: number; endSec: number }[]; nextIdx: number } {
  const chunks: { text: string; startSec: number; endSec: number }[] = []
  let i = startIdx
  let bufStart = i
  while (i < stt.length) {
    const w = stt[i]!
    const next = stt[i + 1]
    const inBuf = i - bufStart + 1
    const gap = next ? next.startSec - w.endSec : Infinity
    const shouldFlush =
      inBuf >= CAPTION_MAX_WORDS ||
      (inBuf >= CAPTION_MIN_WORDS && gap > CAPTION_GAP_SEC) ||
      !next // end of stream
    if (shouldFlush) {
      // Don't flush the trailing chunk while STT is still streaming — wait
      // for either MIN_WORDS+gap or MAX_WORDS so partials don't stutter.
      if (!next && inBuf < CAPTION_MIN_WORDS) break
      const slice = stt.slice(bufStart, i + 1)
      chunks.push({
        text: slice.map(s => s.word).join(' ').replace(/\s+([,.!?;:])/g, '$1'),
        startSec: slice[0]!.startSec,
        endSec: slice[slice.length - 1]!.endSec,
      })
      bufStart = i + 1
    }
    i++
  }
  return { chunks, nextIdx: bufStart }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const event = await findLiveEventById(id)
  if (!event) {
    return new Response(JSON.stringify({ error: 'Event not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })
  }

  const cacheKey = cacheKeyFor(event)

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (name: string, data: unknown) => {
        try { controller.enqueue(encoder.encode(sseEncode(name, data))) } catch { /* closed */ }
      }
      const close = () => { try { controller.close() } catch { /* already closed */ } }

      send('meta', {
        id: event.id,
        symbol: event.symbol,
        name: event.name,
        type: event.type,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        status: event.status,
        // Earnings calls carry year/quarter so the client can render the
        // aligned paragraphs (and look up by canonical key) without a
        // second round-trip.
        year: event.year ?? null,
        quarter: event.quarter ?? null,
        country: event.country ?? null,
        audioAvailable: event.audioAvailable,
        audioProxyUrl: event.audioProxyUrl,
        deepLink: event.deepLink,
      })

      // 1) Earnings short-circuit: if the post-call aligned transcript is
      //    already cached, hand it over immediately.
      const aligned = await fetchAlignedPayload(event)
      if (aligned) {
        send('aligned', aligned)
        send('status', { state: 'ended', reason: 'aligned-transcript-ready' })
        close()
        return
      }

      // 2) Decide what we can stream.
      const hasDeepgram   = !!process.env.DEEPGRAM_API_KEY
      const hasAssemblyAi = !!process.env.ASSEMBLYAI_API_KEY
      const hasStt        = hasDeepgram || hasAssemblyAi
      const canStream     = hasStt && !!event.audioSourceUrl
      if (!canStream) {
        const reason = !event.audioSourceUrl ? 'no-audio-source' : 'no-stt-provider'
        const message = reason === 'no-audio-source'
          ? (event.type === 'earnings'
              ? 'No live audio source is configured for this event. The full transcript will appear here once the post-call alignment lands.'
              : 'No live audio source is configured for this event yet.')
          : 'Live captioning is not configured. Set DEEPGRAM_API_KEY (or ASSEMBLYAI_API_KEY) to enable real-time captions.'
        send('status', { state: 'no-stream', reason, message })
      } else {
        send('status', { state: 'connecting' })
      }

      // 3) Open a real Deepgram streaming session for live partial+final
      //    captions. Falls back to the batch alignment job if Deepgram
      //    streaming isn't available (no key, or transient open failure) —
      //    AssemblyAI's streaming API requires a different audio framing
      //    contract that we deliberately don't pump through here.
      let liveStream: StreamingHandle | null = null
      let promotedToLive = false
      let usingBatchFallback = false
      if (canStream && hasDeepgram && event.audioSourceUrl) {
        let chunkCounter = 0
        liveStream = openLiveDeepgramStream(event.audioSourceUrl, {
          onPartial: (p) => {
            if (!promotedToLive) {
              send('status', { state: 'live', source: 'deepgram-streaming' })
              promotedToLive = true
            }
            chunkCounter += 1
            send('partial', {
              id: chunkCounter,
              text: p.text,
              startSec: p.startSec,
              endSec: p.endSec,
              ts: Date.now(),
            })
          },
          onFinal: (f) => {
            if (!promotedToLive) {
              send('status', { state: 'live', source: 'deepgram-streaming' })
              promotedToLive = true
            }
            chunkCounter += 1
            send('final', {
              id: chunkCounter,
              text: f.text,
              startSec: f.startSec,
              endSec: f.endSec,
              words: f.words,
              ts: Date.now(),
            })
          },
          onClose: (reason) => {
            send('status', { state: 'ended', reason: `stream-closed:${reason}` })
          },
          onError: (err) => {
            // Demote to the batch-cache fallback so we still produce output.
            usingBatchFallback = true
            send('status', {
              state: 'connecting',
              reason: 'streaming-failed-falling-back',
              message: err.message,
            })
          },
        })
        if (!liveStream) usingBatchFallback = true
      } else if (canStream) {
        // No Deepgram key but AssemblyAI is set: fall back to batch.
        usingBatchFallback = true
      }

      // 4) Background STT + paragraph alignment job: still useful (a) as the
      //    cache fallback when the live WS stream isn't running and (b) so
      //    earnings calls get the post-call aligned hand-over.
      if (canStream && (usingBatchFallback || event.type === 'earnings')) {
        ensureAlignmentJob(cacheKey, event.audioSourceUrl!, [{ text: ' ' }])
      }

      // 5) Heartbeat + fallback / aligned-handover poll.
      const start = Date.now()
      let nextSttIdx = 0
      const heartbeat = setInterval(() => send('heartbeat', { ts: Date.now() }), HEARTBEAT_MS)
      const poll = setInterval(async () => {
        // Batch-cache fallback: only consume cached words when the live
        // WS stream isn't producing output, so we never double-emit captions.
        if (usingBatchFallback) {
          const stt = getCachedStt(cacheKey)
          if (stt && stt.length > nextSttIdx) {
            if (!promotedToLive) {
              send('status', { state: 'live', source: 'batch-cache' })
              promotedToLive = true
            }
            const { chunks, nextIdx } = chunkCaptions(stt, nextSttIdx)
            for (const c of chunks) {
              send('final', {
                text: c.text,
                startSec: c.startSec,
                endSec: c.endSec,
                ts: Date.now(),
              })
            }
            nextSttIdx = nextIdx
          }
        }
        // Earnings-only: if the post-call paragraph alignment lands, hand
        // the client over to the SyncedTranscript view and close.
        if (event.type === 'earnings') {
          const a = await fetchAlignedPayload(event)
          if (a) {
            send('aligned', a)
            send('status', { state: 'ended', reason: 'aligned-transcript-ready' })
            liveStream?.close('aligned-handover')
            clearInterval(heartbeat); clearInterval(poll); close()
            return
          }
        }
        if (Date.now() - start > MAX_STREAM_MS) {
          send('status', { state: 'ended', reason: 'stream-budget-exceeded' })
          liveStream?.close('stream-budget-exceeded')
          clearInterval(heartbeat); clearInterval(poll); close()
        }
      }, ALIGN_POLL_MS)

      // 6) Tear down on client disconnect.
      req.signal.addEventListener('abort', () => {
        liveStream?.close('client-disconnect')
        clearInterval(heartbeat); clearInterval(poll); close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}

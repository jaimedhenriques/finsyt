// Real-time streaming ASR via Deepgram's live WebSocket API.
//
// Used by the live event SSE route to produce true `partial` and `final`
// transcript chunks during an active call. The non-streaming batch path in
// `lib/transcript-alignment.ts` is still used post-call to produce the
// paragraph-aligned timing data — the two are complementary, not redundant.
//
// Lifecycle:
//   const handle = openLiveDeepgramStream(audioUrl, callbacks)
//   …
//   handle.close()              // tears down the WS + audio pump
//
// Failure modes are surfaced via `onError` (the SSE route forwards them as a
// `status` event with `state: 'no-stream'` so the UI can fall back to the
// post-call alignment hand-over).
//
// Requirements:
//   • Node ≥ 18 (we use the native global `WebSocket` available in Node 22+;
//     this file is server-only and the `nodejs` runtime is enforced by the
//     SSE route via `export const runtime = 'nodejs'`).
//   • DEEPGRAM_API_KEY set in the env.

export interface StreamingPartial {
  text: string
  startSec: number
  endSec: number
}
export interface StreamingFinal {
  text: string
  startSec: number
  endSec: number
  words: { word: string; startSec: number; endSec: number }[]
}

export interface StreamingCallbacks {
  /** Fired when Deepgram emits an interim (non-final) transcript fragment. */
  onPartial?: (chunk: StreamingPartial) => void
  /** Fired when a transcript fragment is finalized. */
  onFinal?:   (chunk: StreamingFinal)   => void
  /** Fired when the stream closes cleanly (no error). */
  onClose?:   (reason: string)          => void
  /** Fired on any unrecoverable error before the stream finishes. */
  onError?:   (err: Error)              => void
}

export interface StreamingHandle {
  close(reason?: string): void
}

interface DgLiveWord  { word?: string; punctuated_word?: string; start?: number; end?: number }
interface DgLiveAlt   { transcript?: string; words?: DgLiveWord[] }
interface DgLiveChan  { alternatives?: DgLiveAlt[] }
interface DgLiveMsg {
  type?: string
  is_final?: boolean
  speech_final?: boolean
  channel?: DgLiveChan
  start?: number
  duration?: number
}

const DEEPGRAM_LIVE_URL =
  'wss://api.deepgram.com/v1/listen' +
  '?model=nova-2' +
  '&interim_results=true' +
  '&smart_format=true' +
  '&punctuate=true'

// Pump audio bytes from `audioUrl` into the WebSocket as 16 KB frames.
// We deliberately don't try to time the writes to real wall-clock playback —
// Deepgram tolerates faster-than-realtime input, and for archived/replay
// audio sources this lets the transcript catch up quickly. For genuine live
// HLS sources the upstream is already throttled to wall-clock by the audio
// host, so chunk arrival pacing falls out naturally.
async function pumpAudio(
  audioUrl: string,
  ws: WebSocket,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(audioUrl, { signal })
  if (!res.ok) throw new Error(`audio fetch ${res.status}`)
  if (!res.body) throw new Error('audio fetch returned empty body')

  const reader = res.body.getReader()
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value || value.byteLength === 0) continue
      if (ws.readyState !== WebSocket.OPEN) break
      ws.send(value)
    }
  } finally {
    try { reader.releaseLock() } catch { /* ignore */ }
  }
  // Tell Deepgram the audio side is done so it flushes the last frame.
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ type: 'CloseStream' })) } catch { /* ignore */ }
  }
}

export function openLiveDeepgramStream(
  audioUrl: string,
  cbs: StreamingCallbacks,
): StreamingHandle | null {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) return null

  // Native WebSocket in Node ≥ 22. The Authorization header travels via the
  // `Sec-WebSocket-Protocol` value Deepgram supports for browser-style
  // clients (`token, <key>`). We're server-side but this avoids needing the
  // `ws` package just for custom headers.
  let ws: WebSocket
  try {
    ws = new WebSocket(DEEPGRAM_LIVE_URL, ['token', apiKey])
  } catch (e) {
    cbs.onError?.(e instanceof Error ? e : new Error(String(e)))
    return null
  }

  const ctrl = new AbortController()
  let closed = false
  const close = (reason = 'closed') => {
    if (closed) return
    closed = true
    ctrl.abort()
    try { if (ws.readyState <= WebSocket.OPEN) ws.close(1000, reason) } catch { /* ignore */ }
    cbs.onClose?.(reason)
  }

  ws.addEventListener('open', () => {
    pumpAudio(audioUrl, ws, ctrl.signal).catch((err: Error) => {
      // Aborted pumps are expected on close; only surface real errors.
      if (ctrl.signal.aborted) return
      cbs.onError?.(err)
      close('audio-pump-error')
    })
  })

  ws.addEventListener('message', (ev) => {
    const data = typeof ev.data === 'string' ? ev.data : null
    if (!data) return
    let msg: DgLiveMsg
    try { msg = JSON.parse(data) as DgLiveMsg } catch { return }
    if (msg.type && msg.type !== 'Results') return
    const alt = msg.channel?.alternatives?.[0]
    const transcript = alt?.transcript?.trim()
    if (!transcript) return
    const startSec = +Number(msg.start ?? 0).toFixed(2)
    const endSec   = +(Number(msg.start ?? 0) + Number(msg.duration ?? 0)).toFixed(2)
    if (msg.is_final) {
      const words = (alt?.words ?? []).map(w => ({
        word: String(w.punctuated_word ?? w.word ?? ''),
        startSec: +Number(w.start ?? 0).toFixed(2),
        endSec:   +Number(w.end ?? 0).toFixed(2),
      })).filter(w => w.word)
      cbs.onFinal?.({ text: transcript, startSec, endSec, words })
    } else {
      cbs.onPartial?.({ text: transcript, startSec, endSec })
    }
  })

  ws.addEventListener('error', (ev) => {
    const err = (ev as ErrorEvent).error instanceof Error
      ? (ev as ErrorEvent).error
      : new Error('deepgram websocket error')
    cbs.onError?.(err)
    close('ws-error')
  })

  ws.addEventListener('close', (ev) => {
    if (closed) return
    closed = true
    ctrl.abort()
    cbs.onClose?.(`ws-${ev.code}`)
  })

  return { close }
}

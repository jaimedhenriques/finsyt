'use client'
import { use, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/analytics'
import SyncedTranscript from '@/components/SyncedTranscript'

interface LiveEventMeta {
  id: string
  symbol: string
  name: string
  type: 'earnings' | 'cmd' | 'conference'
  startsAt: string
  endsAt: string
  status: 'live' | 'upcoming' | 'ended'
  audioAvailable: boolean
  audioProxyUrl: string
  deepLink: string
  year?: number
  quarter?: number
  country?: string
}

interface CaptionLine {
  id: string
  text: string
  speaker?: string
  role?: string
  startSec?: number
  ts: number
  partial?: boolean
}

// Mirrors the /api/transcripts response shape that SyncedTranscript consumes.
// The aligned SSE event delivers a payload of this shape so the live page can
// hand off without a second fetch.
type ParagraphTimingSource = 'aligned' | 'mixed' | 'estimated'
interface AlignedWord { text: string; startSec: number; endSec: number }
interface AlignedParagraph {
  speaker: string
  role: string
  text: string
  startSec: number
  durationSec?: number
  words?: AlignedWord[]
  timingSource?: ParagraphTimingSource
}
interface AlignedPayload {
  paragraphs: AlignedParagraph[]
  audioUrl?: string | null
  audioAvailable?: boolean
  totalDurationSec?: number
  timingSource?: ParagraphTimingSource
  title?: string
  date?: string
  slides?: { title: string; startSec?: number }[]
}

const TYPE_LABEL: Record<LiveEventMeta['type'], string> = {
  earnings: 'Earnings call',
  cmd: 'Capital markets day',
  conference: 'Investor conference',
}

const TYPE_TONE: Record<LiveEventMeta['type'], { bg: string; fg: string }> = {
  earnings: { bg: 'rgba(27,79,255,0.18)', fg: '#93B4FF' },
  cmd: { bg: 'rgba(124,58,237,0.18)', fg: '#C4B5FD' },
  conference: { bg: 'rgba(13,159,232,0.2)', fg: '#7DD3FC' },
}

function fmtClock(date: Date): string {
  return date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function LiveEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [meta, setMeta] = useState<LiveEventMeta | null>(null)
  const [captions, setCaptions] = useState<CaptionLine[]>([])
  const [streamState, setStreamState] = useState<{ state: string; reason?: string; message?: string }>({ state: 'connecting' })
  const [aligned, setAligned] = useState<AlignedPayload | null>(null)
  const [followLive, setFollowLive] = useState(true)
  const [shareCopied, setShareCopied] = useState(false)
  const captionContainerRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sseRef = useRef<EventSource | null>(null)

  // Track view
  useEffect(() => { track('live_event_view', { id }) }, [id])

  // Open the SSE channel. Handles meta, partial/final captions, status, and
  // the post-call `aligned` swap.
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
    const url = `${base}/api/live-events/${encodeURIComponent(id)}/transcript`
    const es = new EventSource(url)
    sseRef.current = es

    es.addEventListener('meta', (ev: MessageEvent) => {
      try { setMeta(JSON.parse(ev.data)) } catch {}
    })
    es.addEventListener('status', (ev: MessageEvent) => {
      try { setStreamState(JSON.parse(ev.data)) } catch {}
    })
    es.addEventListener('partial', (ev: MessageEvent) => {
      try {
        const d = JSON.parse(ev.data)
        setCaptions(prev => {
          // Replace any trailing partial with the new one; otherwise append.
          const next = prev.length && prev[prev.length - 1].partial ? prev.slice(0, -1) : prev
          return [...next, { id: `p_${Date.now()}`, partial: true, text: d.text, speaker: d.speaker, role: d.role, startSec: d.startSec, ts: d.ts }]
        })
      } catch {}
    })
    es.addEventListener('final', (ev: MessageEvent) => {
      try {
        const d = JSON.parse(ev.data)
        setCaptions(prev => {
          const cleaned = prev.length && prev[prev.length - 1].partial ? prev.slice(0, -1) : prev
          return [...cleaned, { id: `f_${cleaned.length}_${d.ts}`, partial: false, text: d.text, speaker: d.speaker, role: d.role, startSec: d.startSec, ts: d.ts }]
        })
      } catch {}
    })
    es.addEventListener('aligned', (ev: MessageEvent) => {
      try {
        setAligned(JSON.parse(ev.data))
        setStreamState({ state: 'ended', reason: 'aligned-transcript-ready' })
      } catch {}
    })
    es.addEventListener('heartbeat', () => { /* keep-alive only */ })
    es.onerror = () => {
      // Browser will auto-reconnect; surface a transient note.
      setStreamState(s => s.state === 'ended' ? s : { state: 'reconnecting' })
    }
    return () => { es.close(); sseRef.current = null }
  }, [id])

  // Auto-scroll to bottom when new captions arrive (unless user paused follow).
  useEffect(() => {
    if (!followLive) return
    const el = captionContainerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [captions, followLive])

  function copyShare() {
    const url = meta?.deepLink || (typeof window !== 'undefined' ? window.location.href : '')
    if (!url) return
    try {
      navigator.clipboard.writeText(url)
      setShareCopied(true)
      track('live_event_share', { id })
      setTimeout(() => setShareCopied(false), 1600)
    } catch {}
  }

  const audioSrc = useMemo(() => {
    if (!meta?.audioAvailable) return null
    return meta.audioProxyUrl
  }, [meta])

  const startsAt = meta?.startsAt ? new Date(meta.startsAt) : null
  const endsAt   = meta?.endsAt   ? new Date(meta.endsAt) : null
  const tone     = meta ? TYPE_TONE[meta.type] : TYPE_TONE.earnings

  // If we received an aligned transcript mid-/post-call, hand off entirely
  // to the SyncedTranscript component — same UI as the company workspace
  // transcripts tab — preserving word-level highlighting and audio sync.
  // We pass `paragraphs` directly so SyncedTranscript renders the aligned
  // payload from the SSE event without re-fetching (eliminates the chance
  // of falling back to placeholder text if year/quarter aren't carried by
  // a non-earnings event).
  if (aligned && meta) {
    const call = {
      title: aligned.title || `${meta.symbol} ${meta.year && meta.quarter ? `Q${meta.quarter} ${meta.year} ` : ''}${TYPE_LABEL[meta.type]}`,
      date: aligned.date || (startsAt ? startsAt.toISOString().slice(0, 10) : ''),
      isLive: false,
      year: meta.year,
      quarter: meta.quarter,
    }
    return (
      <div style={{ padding: '1.75rem', maxWidth: 1100, margin: '0 auto' }}>
        <Header meta={meta} startsAt={startsAt} endsAt={endsAt} tone={tone} aligned onShare={copyShare} shareCopied={shareCopied} />
        <SyncedTranscript symbol={meta.symbol} call={call} paragraphs={aligned.paragraphs} />
      </div>
    )
  }

  return (
    <div style={{ padding: '1.75rem', maxWidth: 1100, margin: '0 auto' }}>
      <Header meta={meta} startsAt={startsAt} endsAt={endsAt} tone={tone} onShare={copyShare} shareCopied={shareCopied} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
        {/* Audio player */}
        <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', padding: 16 }}>
          {audioSrc ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#7B96B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Live audio</span>
                <span style={{ fontSize: 11, color: '#4A6280' }}>via Finsyt audio relay</span>
              </div>
              <audio ref={audioRef} src={audioSrc} controls preload="auto" autoPlay style={{ width: '100%' }}
                onPlay={() => track('live_event_audio_play', { id })}
                onError={() => track('live_event_audio_error', { id })} />
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16, color: '#FBBF24' }}>⚠</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#E2EEFF' }}>Audio unavailable</div>
                <div style={{ fontSize: 11, color: '#7B96B8', marginTop: 2 }}>
                  No live audio source is configured for this event yet. The full transcript will appear here automatically once the post-call alignment finishes.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Live transcript */}
        <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#E2EEFF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Live transcript</span>
            <StatusPill state={streamState.state} />
            <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#7B96B8', cursor: 'pointer' }}>
              <input type="checkbox" checked={followLive} onChange={e => setFollowLive(e.target.checked)} />
              Follow live
            </label>
          </div>

          <div ref={captionContainerRef} style={{ height: 460, overflowY: 'auto', padding: '10px 18px', fontSize: 14, lineHeight: 1.6 }}>
            {streamState.state === 'no-stream' && captions.length === 0 && (
              <div style={{ padding: 30, textAlign: 'center', color: '#7B96B8', fontSize: 13 }}>
                {streamState.message || 'Live captions are not available for this event yet.'}
              </div>
            )}
            {captions.length === 0 && streamState.state !== 'no-stream' && (
              <div style={{ padding: 30, textAlign: 'center', color: '#7B96B8', fontSize: 13 }}>
                Connecting to live caption stream… new lines will appear here as the speakers talk.
              </div>
            )}
            {captions.map(c => (
              <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: c.partial ? 0.65 : 1 }}>
                {c.speaker && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#93B4FF' }}>{c.speaker}</span>
                    {c.role && <span style={{ fontSize: 10, color: '#7B96B8' }}>· {c.role}</span>}
                    {c.partial && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', color: '#7B96B8', letterSpacing: '0.04em' }}>PARTIAL</span>}
                  </div>
                )}
                <div style={{ color: c.partial ? '#9BAFC8' : '#E2EEFF' }}>{c.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Header({ meta, startsAt, endsAt, tone, aligned, onShare, shareCopied }:
  { meta: LiveEventMeta | null; startsAt: Date | null; endsAt: Date | null; tone: { bg: string; fg: string }; aligned?: boolean; onShare: () => void; shareCopied: boolean }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, color: '#7B96B8', marginBottom: 8 }}>
        <Link href="/app/calendar" style={{ color: '#7B96B8', textDecoration: 'none' }}>Calendar</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span style={{ color: '#E2EEFF', fontWeight: 700 }}>{meta?.symbol || '…'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 16 }}>
          {meta?.symbol?.slice(0, 4) || '…'}
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#E2EEFF', letterSpacing: '-0.02em', margin: 0 }}>
              {meta?.name || meta?.symbol || 'Live event'}
            </h1>
            {meta && (
              <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 12, background: tone.bg, color: tone.fg, letterSpacing: '0.04em' }}>
                {TYPE_LABEL[meta.type]}
              </span>
            )}
            {meta?.status === 'live' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 12, background: 'rgba(248,113,113,0.18)', color: 'var(--neg)', letterSpacing: '0.04em' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--neg)', boxShadow: '0 0 8px rgba(248,113,113,0.8)' }} />
                LIVE NOW
              </span>
            )}
            {aligned && (
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 8, background: 'rgba(34,197,94,0.18)', color: 'var(--pos)' }}>AUDIO ALIGNED</span>
            )}
            {meta?.country && <span style={{ fontSize: 10, color: '#7B96B8', padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', fontWeight: 700 }}>{meta.country}</span>}
          </div>
          <div style={{ fontSize: 12, color: '#7B96B8', marginTop: 4 }}>
            {startsAt ? `${fmtClock(startsAt)} → ${endsAt ? endsAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'}` : '—'}
            {meta?.symbol && (
              <>
                {' · '}
                <Link href={`/app/company/${meta.symbol}`} style={{ color: '#93B4FF', textDecoration: 'none' }}>
                  Open {meta.symbol} workspace ›
                </Link>
              </>
            )}
          </div>
        </div>
        <button onClick={onShare} title="Copy a deep link to this live event" style={{
          padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
          background: shareCopied ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.04)',
          color: shareCopied ? 'var(--pos)' : '#E2EEFF', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>
          {shareCopied ? '✓ Link copied' : '⎘ Share'}
        </button>
      </div>
    </div>
  )
}

function StatusPill({ state }: { state: string }) {
  const tone =
    state === 'live'         ? { bg: 'rgba(34,197,94,0.18)', fg: 'var(--pos)', label: 'LIVE' } :
    state === 'connecting'   ? { bg: 'rgba(255,255,255,0.06)', fg: '#7B96B8', label: 'CONNECTING' } :
    state === 'reconnecting' ? { bg: 'rgba(251,191,36,0.18)', fg: 'var(--amber)', label: 'RECONNECTING' } :
    state === 'no-stream'    ? { bg: 'rgba(255,255,255,0.06)', fg: '#7B96B8', label: 'CAPTIONS UNAVAILABLE' } :
    state === 'ended'        ? { bg: 'rgba(255,255,255,0.06)', fg: '#7B96B8', label: 'ENDED' } :
                               { bg: 'rgba(255,255,255,0.06)', fg: '#7B96B8', label: state.toUpperCase() }
  return (
    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 8, background: tone.bg, color: tone.fg, letterSpacing: '0.04em' }}>
      {tone.label}
    </span>
  )
}

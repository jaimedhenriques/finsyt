'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMiniPlayer, PlayerTrack, PlayerSlideMarker } from './MiniAudioPlayer'
import { track as trackEvent } from '@/lib/analytics'

interface Word { text: string; startSec: number; endSec: number; matched?: boolean }
type ParagraphTimingSource = 'aligned' | 'mixed' | 'estimated'
interface Paragraph { speaker: string; role: string; text: string; startSec: number; durationSec?: number; words?: Word[]; timingSource?: ParagraphTimingSource }

interface CallMeta {
  title: string
  date: string
  isLive?: boolean
  year?: string | number
  quarter?: string | number
}

interface Props {
  symbol: string
  call: CallMeta
  paragraphs?: Paragraph[]
  onCite?: (label: string, body: string) => void
}

const FALLBACK_PARAS = (sym: string): Paragraph[] => [
  { speaker: 'Operator', role: 'Operator', startSec: 0,
    text: `Good afternoon and welcome to the ${sym} earnings conference call. At this time all participants are in a listen-only mode. After the speakers' presentation there will be a question-and-answer session.` },
  { speaker: 'Investor Relations', role: 'IR', startSec: 35,
    text: `Thank you operator, and good afternoon everyone. Joining me on today's call are our CEO and our CFO. Before we begin, let me remind you that today's call may include forward-looking statements.` },
  { speaker: 'Chief Executive', role: 'CEO', startSec: 105,
    text: `Thanks and good afternoon everyone. We delivered solid results this quarter. Revenue grew double digits year-over-year, driven by strength across our core franchises.` },
  { speaker: 'Chief Financial Officer', role: 'CFO', startSec: 175,
    text: `Turning to the financials. Gross margin expanded reflecting product mix and operational efficiency. We continue to invest in long-term growth while delivering operating leverage.` },
  { speaker: 'Operator', role: 'Operator', startSec: 240,
    text: `Thank you. We will now begin the question-and-answer session.` },
]

export default function SyncedTranscript({ symbol, call, paragraphs, onCite }: Props) {
  const player = useMiniPlayer()
  const [fetched, setFetched] = useState<{ paragraphs: Paragraph[]; audioUrl?: string | null; totalDurationSec?: number; timingSource?: ParagraphTimingSource; slides?: { title: string; startSec?: number }[] } | null>(null)
  const [loadingTx, setLoadingTx] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')

  // Fetch real transcript paragraphs (with timestamps + audio URL) when we
  // have a year/quarter and weren't given paragraphs by the parent.
  // The first response may carry estimated timings while a background
  // alignment job runs server-side; we poll the same endpoint until the
  // server reports `aligned` (or we hit the budget) so the player swaps
  // over to real audio-anchored timings without a manual refresh.
  useEffect(() => {
    if (paragraphs?.length) { setFetched(null); return }
    if (!call.year || !call.quarter) { setFetched(null); return }
    let cancelled = false
    let attempts = 0
    const MAX_ATTEMPTS = 36 // ~3 minutes at 5s
    setLoadingTx(true)
    const url = `/api/transcripts?symbol=${symbol}&year=${call.year}&quarter=${call.quarter}`
    const fetchOnce = (): Promise<'aligned' | 'pending' | 'no-audio' | 'error'> =>
      fetch(url)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (cancelled || !d) return 'error' as const
          if (Array.isArray(d.paragraphs) && d.paragraphs.length) {
            setFetched({ paragraphs: d.paragraphs, audioUrl: d.audioUrl ?? null, totalDurationSec: d.totalDurationSec, timingSource: d.timingSource, slides: Array.isArray(d.slides) ? d.slides : undefined })
          }
          if (d.timingSource === 'aligned') return 'aligned'
          if (!d.audioAvailable) return 'no-audio'
          return 'pending'
        })
        .catch(() => 'error' as const)
    const tick = async () => {
      const status = await fetchOnce()
      if (cancelled) return
      attempts++
      setLoadingTx(false)
      if (status === 'pending' && attempts < MAX_ATTEMPTS) {
        setTimeout(tick, 5000)
      }
    }
    tick()
    return () => { cancelled = true }
  }, [symbol, call.year, call.quarter, paragraphs])

  const paras: Paragraph[] = useMemo(() => {
    if (paragraphs?.length) return paragraphs
    if (fetched?.paragraphs?.length) return fetched.paragraphs
    return FALLBACK_PARAS(symbol)
  }, [paragraphs, fetched, symbol])

  const audioUrl = fetched?.audioUrl || undefined
  const audioMissing = fetched != null && !audioUrl
  const totalDur = fetched?.totalDurationSec ?? (paras[paras.length - 1]?.startSec ?? 0) + ((paras[paras.length - 1]?.durationSec ?? 90))

  const isThisTrack = player.track?.symbol === symbol && player.track?.title === call.title

  // Find active paragraph based on player position
  const activeIdx = useMemo(() => {
    if (!isThisTrack) return -1
    for (let i = paras.length - 1; i >= 0; i--) if (paras[i].startSec <= player.position) return i
    return 0
  }, [paras, player.position, isThisTrack])

  // Word-level highlight from the per-word timing payload returned by the
  // API. When `words[]` is not provided (e.g. the demo fallback paragraphs)
  // we fall back to interpolating within the paragraph duration.
  const activeWordIdx = useMemo(() => {
    if (!isThisTrack || activeIdx < 0) return -1
    const p = paras[activeIdx]
    if (!p) return -1
    if (p.words && p.words.length) {
      for (let i = p.words.length - 1; i >= 0; i--) {
        if (p.words[i].startSec <= player.position) return i
      }
      return 0
    }
    const dur = p.durationSec || ((paras[activeIdx + 1]?.startSec ?? p.startSec + 30) - p.startSec)
    if (dur <= 0) return -1
    const elapsed = Math.max(0, player.position - p.startSec)
    const words = p.text.split(/\s+/).filter(Boolean)
    if (!words.length) return -1
    return Math.min(words.length - 1, Math.floor((elapsed / dur) * words.length))
  }, [isThisTrack, activeIdx, paras, player.position])

  // Auto-scroll to keep the active paragraph centred
  useEffect(() => {
    if (activeIdx >= 0 && activeRef.current && containerRef.current) {
      const c = containerRef.current
      const el = activeRef.current
      const offset = el.offsetTop - c.offsetTop - 80
      c.scrollTo({ top: offset, behavior: 'smooth' })
    }
  }, [activeIdx])

  function play() {
    const markers: PlayerSlideMarker[] | undefined = fetched?.slides
      ? fetched.slides
          .filter(s => typeof s.startSec === 'number')
          .map(s => ({ title: s.title, startSec: s.startSec as number }))
      : undefined
    const t: PlayerTrack = { symbol, title: call.title, date: call.date, durationSec: totalDur, isLive: call.isLive, audioUrl, slides: markers && markers.length ? markers : undefined }
    player.load(t)
    trackEvent('transcript_play', { symbol, call: call.title, hasAudio: !!audioUrl })
  }

  function jump(sec: number, idx: number) {
    if (!isThisTrack) play()
    setTimeout(() => player.seek(sec), 50)
    trackEvent('transcript_seek', { symbol, idx })
  }

  function fmt(s: number) { const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, '0')}` }

  const filtered = search ? paras.map((p, i) => ({ p, i })).filter(({ p }) => p.text.toLowerCase().includes(search.toLowerCase()) || p.speaker.toLowerCase().includes(search.toLowerCase())) : paras.map((p, i) => ({ p, i }))

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0A1628', display: 'flex', alignItems: 'center', gap: 8 }}>
            {call.title}
            {call.isLive && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: 'var(--neg-dim)', color: 'var(--neg)', letterSpacing: '0.04em' }}>● LIVE</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>{call.date}</span>
            <span>·</span>
            <span>{loadingTx ? 'loading transcript…' : (audioUrl ? 'streaming audio + synced transcript' : 'synced transcript (silent playback)')}</span>
            {audioMissing && !loadingTx && (
              <span title="Audio source not configured" style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: '#FEF3C7', color: '#92400E' }}>AUDIO UNAVAILABLE</span>
            )}
            {fetched?.timingSource === 'estimated' && (
              <span title="Word timing estimated from speaking rate; no audio alignment available" style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: '#E0F2FE', color: '#075985' }}>EST. TIMING</span>
            )}
            {fetched?.timingSource === 'mixed' && (
              <span title="Most words anchored to real audio; some interpolated between matched anchors" style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: '#FEF3C7', color: '#92400E' }}>PARTIAL ALIGN</span>
            )}
            {fetched?.timingSource === 'aligned' && (
              <span title="Every word timestamped from the call audio" style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: '#DCFCE7', color: '#166534' }}>AUDIO ALIGNED</span>
            )}
          </div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transcript..."
          style={{ width: 180, padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
        <button onClick={play} disabled={loadingTx} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: isThisTrack ? 'var(--pos)' : 'var(--gradient-brand)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: loadingTx ? 'wait' : 'pointer', opacity: loadingTx ? 0.7 : 1 }}>
          {isThisTrack ? (player.playing ? '❚❚ Pause' : '▶ Resume') : (call.isLive ? 'Join live' : '▶ Play call')}
        </button>
      </div>
      <div ref={containerRef} style={{ maxHeight: 540, overflowY: 'auto', padding: '8px 0' }}>
        {loadingTx && !paras.length && <div style={{ padding: 40, textAlign: 'center', color: '#9BAFC8', fontSize: 13 }}>Loading transcript…</div>}
        {filtered.map(({ p, i }) => {
          const active = i === activeIdx
          return (
            <div key={i} ref={active ? activeRef : null}
              onClick={() => jump(p.startSec, i)}
              style={{
                padding: '14px 22px', cursor: 'pointer',
                background: active ? 'linear-gradient(90deg, rgba(27,79,255,0.08), transparent)' : 'transparent',
                borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                transition: 'background 0.2s, border-color 0.2s',
                position: 'relative',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: speakerColor(p.speaker), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                  {initials(p.speaker)}
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, color: active ? 'var(--accent)' : 'var(--text-primary)' }}>{p.speaker}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '1px 6px', borderRadius: 4, background: 'var(--bg-elevated)' }}>{p.role}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: active ? 'var(--accent)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(p.startSec)}</span>
                {onCite && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onCite(`${call.title} · ${p.speaker} (${fmt(p.startSec)})`, p.text)
                      trackEvent('transcript_cite', { symbol, idx: i })
                    }}
                    title="Open citation in side drawer"
                    aria-label={`Cite ${p.speaker} at ${fmt(p.startSec)}`}
                    style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, border: '1px solid var(--accent-dim)', background: 'var(--accent-dim)', color: 'var(--accent-text)', cursor: 'pointer' }}
                  >◆ Cite</button>
                )}
              </div>
              <div style={{ fontSize: 13, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: 38 }}>
                {active && activeWordIdx >= 0
                  ? renderWords(p.text, activeWordIdx, search)
                  : highlight(p.text, search)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function speakerColor(name: string) {
  const palette = ['var(--accent)', 'var(--pos)', 'var(--amber)', '#7C3AED', 'var(--neg)', '#0D9FE8', '#0891B2']
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}
function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()
}
function highlight(text: string, q: string) {
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return <>{text.slice(0, idx)}<mark style={{ background: '#FEF3C7', color: '#0A1628', padding: '0 2px', borderRadius: 2 }}>{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</>
}
function renderWords(text: string, activeWordIdx: number, q: string) {
  const words = text.split(/(\s+)/)
  let wi = -1
  return (
    <>
      {words.map((w, i) => {
        if (/\S/.test(w)) {
          wi += 1
          const isActive = wi === activeWordIdx
          const isPast = wi < activeWordIdx
          const matchesQ = q && w.toLowerCase().includes(q.toLowerCase())
          return (
            <span key={i} style={{
              background: isActive ? 'rgba(27,79,255,0.18)' : (matchesQ ? '#FEF3C7' : 'transparent'),
              color: isPast ? '#0A1628' : (isActive ? '#0A1628' : undefined),
              fontWeight: isActive ? 700 : undefined,
              borderRadius: 3, padding: isActive ? '0 2px' : 0,
              transition: 'background 0.12s',
            }}>{w}</span>
          )
        }
        return <span key={i}>{w}</span>
      })}
    </>
  )
}

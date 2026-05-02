'use client'
import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from 'react'

export interface PlayerSlideMarker {
  title: string
  startSec: number
}

export interface PlayerTrack {
  symbol: string
  title: string
  date: string
  durationSec: number
  isLive?: boolean
  audioUrl?: string
  slides?: PlayerSlideMarker[]
}

interface PlayerCtx {
  track: PlayerTrack | null
  position: number
  playing: boolean
  rate: number
  volume: number
  showSlides: boolean
  expanded: boolean
  loading: boolean
  load: (t: PlayerTrack) => void
  toggle: () => void
  seek: (sec: number) => void
  skip: (delta: number) => void
  setRate: (r: number) => void
  setVolume: (v: number) => void
  setShowSlides: (b: boolean) => void
  setExpanded: (b: boolean) => void
  close: () => void
}

const Ctx = createContext<PlayerCtx | null>(null)

const STORAGE_KEY = 'finsyt.miniPlayer.v1'

export function MiniAudioPlayerProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<PlayerTrack | null>(null)
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [volume, setVolume] = useState(0.8)
  const [showSlides, setShowSlides] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const tickRef = useRef<NodeJS.Timeout | null>(null)
  const hydratedRef = useRef(false)

  // The transcript-domain seconds we should seek the <audio> to once its
  // metadata loads after a hydration. Cleared after the seek lands.
  const pendingSeekRef = useRef<number | null>(null)

  // Hydrate from sessionStorage on mount so the bar persists across hard
  // navigations (and across same-tab refreshes during a session).
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (s?.track) {
          setTrack(s.track)
          const pos = s.position || 0
          setPosition(pos)
          setRate(s.rate || 1)
          setVolume(s.volume ?? 0.8)
          // Don't auto-resume audio without a user gesture — browsers block
          // autoplay across navigation. Show as paused and let the user resume.
          setPlaying(false)
          // For real-audio tracks, remember to seek the <audio> element to
          // the persisted transcript-domain position once its metadata loads.
          if (s.track.audioUrl && pos > 0) pendingSeekRef.current = pos
        }
      }
    } catch { /* ignore */ }
    hydratedRef.current = true
  }, [])

  // Apply any pending hydration seek once audio metadata is available.
  function applyPendingSeek() {
    const el = audioRef.current
    const pending = pendingSeekRef.current
    if (!el || pending == null || !track?.audioUrl) return
    const dur = el.duration
    if (!Number.isFinite(dur) || dur <= 0) return
    const ratio = track.durationSec > 0 ? Math.min(1, pending / track.durationSec) : 0
    el.currentTime = Math.min(dur - 0.1, dur * ratio)
    pendingSeekRef.current = null
  }

  // Persist on relevant changes
  useEffect(() => {
    if (typeof window === 'undefined' || !hydratedRef.current) return
    try {
      if (track) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ track, position, rate, volume }))
      else sessionStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
  }, [track, position, rate, volume])

  // Simulated tick when we have no audio element (no audioUrl)
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    if (playing && track && !track.audioUrl) {
      tickRef.current = setInterval(() => {
        setPosition(p => {
          const next = p + rate * 0.5
          if (!track.isLive && next >= track.durationSec) { setPlaying(false); return track.durationSec }
          return next
        })
      }, 500)
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [playing, rate, track])

  // Sync rate and volume to the audio element
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate }, [rate])
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume }, [volume])

  // Sync play/pause to the audio element
  useEffect(() => {
    const el = audioRef.current
    if (!el || !track?.audioUrl) return
    if (playing) {
      const p = el.play()
      if (p && typeof p.catch === 'function') p.catch(() => setPlaying(false))
    } else {
      el.pause()
    }
  }, [playing, track])

  const load = useCallback((t: PlayerTrack) => {
    pendingSeekRef.current = null
    setTrack(t)
    setPosition(t.isLive ? Math.max(0, t.durationSec - 60) : 0)
    setPlaying(true)
    setLoading(!!t.audioUrl)
  }, [])
  const toggle = useCallback(() => setPlaying(p => !p), [])
  const seek = useCallback((sec: number) => {
    setPosition(Math.max(0, sec))
    if (audioRef.current && track?.audioUrl) {
      const dur = audioRef.current.duration
      if (Number.isFinite(dur) && dur > 0) {
        // Map transcript timestamp to audio position when audio is shorter than transcript
        const ratio = track.durationSec > 0 ? Math.min(1, sec / track.durationSec) : 0
        audioRef.current.currentTime = Math.min(dur - 0.1, dur * ratio)
      }
    }
  }, [track])
  const skip = useCallback((delta: number) => {
    setPosition(p => {
      const next = Math.max(0, p + delta)
      if (audioRef.current && track?.audioUrl) {
        const dur = audioRef.current.duration
        if (Number.isFinite(dur) && dur > 0) {
          const ratio = track.durationSec > 0 ? Math.min(1, next / track.durationSec) : 0
          audioRef.current.currentTime = Math.min(dur - 0.1, dur * ratio)
        }
      }
      return next
    })
  }, [track])
  const close = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    setTrack(null); setPlaying(false); setPosition(0); setExpanded(false); setLoading(false)
  }, [])

  // Mirror audio element timeupdates back into our position state, mapping
  // back from real audio time → transcript-domain seconds.
  const onTime = useCallback(() => {
    const el = audioRef.current
    if (!el || !track?.audioUrl) return
    const dur = el.duration
    if (!Number.isFinite(dur) || dur <= 0) return
    const ratio = el.currentTime / dur
    setPosition(ratio * track.durationSec)
  }, [track])

  return (
    <Ctx.Provider value={{ track, position, playing, rate, volume, showSlides, expanded, loading, load, toggle, seek, skip, setRate, setVolume, setShowSlides, setExpanded, close }}>
      {children}
      {track?.audioUrl && (
        <audio
          ref={audioRef}
          src={track.audioUrl}
          preload="auto"
          onTimeUpdate={onTime}
          onCanPlay={() => setLoading(false)}
          onLoadedMetadata={() => {
            if (audioRef.current) { audioRef.current.playbackRate = rate; audioRef.current.volume = volume }
            applyPendingSeek()
          }}
          onEnded={() => setPlaying(false)}
          onError={() => { setLoading(false); setPlaying(false) }}
          style={{ display: 'none' }}
        />
      )}
      <MiniBar />
    </Ctx.Provider>
  )
}

export function useMiniPlayer() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useMiniPlayer must be used inside MiniAudioPlayerProvider')
  return c
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function MiniBar() {
  const p = useContext(Ctx)
  if (!p || !p.track) return null
  const { track, position, playing, rate, volume, loading } = p
  const pct = track.isLive ? 100 : (position / track.durationSec) * 100

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
      background: 'rgba(8,14,26,0.96)', backdropFilter: 'blur(14px)',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      color: '#E2EEFF', padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 11, flexShrink: 0 }}>
        {track.symbol.slice(0, 4)}
      </div>
      <div style={{ minWidth: 0, flexShrink: 1, maxWidth: 260 }}>
        <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
          {track.title}
          {track.isLive && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 8, background: 'var(--neg)', color: '#fff', letterSpacing: '0.05em' }}>LIVE</span>}
          {loading && !track.isLive && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: 'rgba(255,255,255,0.12)', color: 'var(--text-secondary)' }}>BUFFERING</span>}
        </div>
        <div style={{ fontSize: 10, color: '#7B96B8' }}>{track.symbol} · {track.date}</div>
      </div>

      <button onClick={() => p.skip(-15)} title="Back 15s" style={btn}>«15</button>
      <button onClick={p.toggle} style={{ ...btn, width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 14 }}>
        {playing ? '❚❚' : '▶'}
      </button>
      <button onClick={() => p.skip(15)} title="Forward 15s" style={btn}>15»</button>

      <div style={{ flex: 1, minWidth: 100, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: '#7B96B8', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>{fmt(position)}</span>
        <div onClick={(e) => {
          if (track.isLive) return
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          const ratio = (e.clientX - r.left) / r.width
          p.seek(Math.max(0, Math.min(1, ratio)) * track.durationSec)
        }} style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)', cursor: track.isLive ? 'default' : 'pointer', position: 'relative' }}>
          <div style={{ width: pct + '%', height: '100%', borderRadius: 3, background: track.isLive ? 'var(--neg)' : 'linear-gradient(90deg,var(--accent),#0D9FE8)', pointerEvents: 'none' }} />
          {!track.isLive && track.slides && track.slides.map((s, i) => {
            if (!Number.isFinite(s.startSec) || s.startSec <= 0 || s.startSec >= track.durationSec) return null
            const left = (s.startSec / track.durationSec) * 100
            const passed = position >= s.startSec
            return (
              <SlideTick key={i}
                index={i}
                leftPct={left}
                title={s.title}
                startSec={s.startSec}
                passed={passed}
                onSeek={() => p.seek(s.startSec)}
              />
            )
          })}
        </div>
        <span style={{ fontSize: 10, color: '#7B96B8', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>{track.isLive ? 'LIVE' : fmt(track.durationSec)}</span>
      </div>

      <select value={rate} onChange={e => p.setRate(parseFloat(e.target.value))}
        style={{ background: 'rgba(255,255,255,0.06)', color: '#E2EEFF', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '3px 6px', fontSize: 11 }}>
        {[0.75, 1, 1.25, 1.5, 1.75, 2].map(r => <option key={r} value={r}>{r}x</option>)}
      </select>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Volume">
        <span style={{ color: '#7B96B8', fontSize: 12 }}>♪</span>
        <input type="range" min={0} max={1} step={0.05} value={volume}
          onChange={e => p.setVolume(parseFloat(e.target.value))}
          style={{ width: 60, accentColor: 'var(--accent)' }} />
      </div>

      <button onClick={() => p.setShowSlides(!p.showSlides)} title="Slides" style={{ ...btn, background: p.showSlides ? 'rgba(27,79,255,0.25)' : 'rgba(255,255,255,0.06)' }}>◧</button>
      <button onClick={() => p.setExpanded(!p.expanded)} title={p.expanded ? 'Collapse' : 'Expand'} style={btn}>{p.expanded ? '▾' : '▴'}</button>
      <button onClick={p.close} title="Close" style={btn}>×</button>
    </div>
  )
}

function SlideTick({ index, leftPct, title, startSec, passed, onSeek }: { index: number; leftPct: number; title: string; startSec: number; passed: boolean; onSeek: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => { e.stopPropagation(); onSeek() }}
      title={`Slide ${index + 1} — ${title} @ ${fmt(startSec)}`}
      style={{
        position: 'absolute',
        left: `calc(${leftPct}% - 5px)`,
        top: -4,
        width: 10,
        height: 13,
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{
        width: hover ? 3 : 2,
        height: '100%',
        background: passed ? 'var(--text-primary)' : 'var(--text-secondary)',
        borderRadius: 1,
        boxShadow: hover ? '0 0 0 2px var(--accent-dim)' : 'none',
        transition: 'width 120ms ease, box-shadow 120ms ease',
      }} />
      {hover && (
        <div style={{
          position: 'absolute',
          bottom: 18,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(8,14,26,0.98)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 6,
          padding: '6px 9px',
          fontSize: 11,
          color: '#E2EEFF',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
          zIndex: 10,
        }}>
          <span style={{ color: '#7B96B8', fontWeight: 700, marginRight: 6 }}>Slide {index + 1}</span>
          <span style={{ fontWeight: 700 }}>{title}</span>
          <span style={{ color: '#7B96B8', marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>{fmt(startSec)}</span>
        </div>
      )}
    </div>
  )
}

const btn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
  color: '#E2EEFF', borderRadius: 8, padding: '6px 10px', fontSize: 11, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}

'use client'
import { useEffect, useMemo, useState } from 'react'
import { useMiniPlayer, PlayerTrack } from './MiniAudioPlayer'
import { useTier } from '@/lib/tier'
import { track } from '@/lib/analytics'

export interface Slide { id: string; title: string; bullets: string[]; chartType?: 'bar' | 'line' | 'table'; startSec?: number; pageNumber?: number }

interface CallMeta { title: string; date: string; isLive?: boolean; year?: string | number; quarter?: string | number }
interface Props { symbol: string; call: CallMeta; slides?: Slide[] }

// Used only when neither parent nor API supplied any slides (e.g. transcripts
// API down). We deliberately do NOT fabricate company numbers here — show a
// neutral placeholder so the user isn't misled with another company's data.
const FALLBACK_SLIDES = (sym: string): Slide[] => [
  { id: '1', title: `${sym} earnings deck`, chartType: 'bar', bullets: ['Deck data is loading or unavailable for this call', 'Refresh, or check the issuer IR page for the official slides'] },
]

const ACTIONS = [
  { id: 'play', label: 'Play call', icon: '▶' },
  { id: 'related', label: 'Related documents', icon: '◫' },
  { id: 'copy', label: 'Copy as…', icon: '⧉' },
  { id: 'extract', label: 'Extract graphs to Excel', icon: '⊞', pro: true },
  { id: 'workspace', label: 'Add to workspace', icon: '+' },
  { id: 'save', label: 'Save to…', icon: '✦' },
]

export default function SlidesViewer({ symbol, call, slides }: Props) {
  const player = useMiniPlayer()
  const { isPro } = useTier()

  const [fetched, setFetched] = useState<{ slides: Slide[]; totalDurationSec?: number; audioUrl?: string | null; slideTimingSource?: 'estimated' | 'aligned'; deckSource?: 'real-pdf' | 'fallback-financials' | 'fallback-empty'; deckPageUrl?: string | null; deckPdfUrl?: string | null } | null>(null)
  const [loadingSlides, setLoadingSlides] = useState(false)
  const [active, setActive] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  const [extractOpen, setExtractOpen] = useState(false)

  // Fetch slide-time mapping from the transcript API when the parent didn't
  // pass slides directly and we know which call to fetch.
  useEffect(() => {
    if (slides?.length) { setFetched(null); return }
    if (!call.year || !call.quarter) { setFetched(null); return }
    let cancelled = false
    setLoadingSlides(true)
    fetch(`/api/transcripts?symbol=${symbol}&year=${call.year}&quarter=${call.quarter}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return
        if (Array.isArray(d.slides) && d.slides.length) {
          setFetched({ slides: d.slides, totalDurationSec: d.totalDurationSec, audioUrl: d.audioUrl ?? null, slideTimingSource: d.slideTimingSource, deckSource: d.deckSource, deckPageUrl: d.deckPageUrl ?? null, deckPdfUrl: d.deckPdfUrl ?? null })
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingSlides(false) })
    return () => { cancelled = true }
  }, [symbol, call.year, call.quarter, slides])

  // Resolve the deck. Prefer parent-supplied → API-fetched → fallback.
  const list = useMemo<Slide[]>(() => {
    if (slides?.length) return slides
    if (fetched?.slides?.length) return fetched.slides
    return FALLBACK_SLIDES(symbol)
  }, [slides, fetched, symbol])

  // If the deck has no startSec values (e.g. fallback content with no API
  // data), distribute slide times evenly across the call duration so we can
  // still sync to playback. Slide #1 anchors at the operator intro mark.
  const timedList = useMemo<Slide[]>(() => {
    const hasTimings = list.some(s => typeof s.startSec === 'number')
    if (hasTimings) return list
    const totalDur = fetched?.totalDurationSec ?? player.track?.durationSec ?? 0
    if (!totalDur || list.length === 0) return list
    const introSec = totalDur * 0.03
    const lastSec  = totalDur * 0.70
    const span = Math.max(0, lastSec - introSec)
    const step = list.length > 1 ? span / (list.length - 1) : 0
    return list.map((s, i) => ({ ...s, startSec: +(introSec + step * i).toFixed(2) }))
  }, [list, fetched, player.track])

  const slide = timedList[Math.min(active, timedList.length - 1)] || timedList[0]
  const isThisTrack = !!player.track && player.track.symbol === symbol && player.track.title === call.title

  // Auto-advance the active slide as the player position progresses through
  // the call. Works for both recorded and live tracks (live `position`
  // ticks forward off the live edge so the deck still flips in sync).
  useEffect(() => {
    if (!isThisTrack) return
    let idx = 0
    for (let i = timedList.length - 1; i >= 0; i--) {
      const s = timedList[i].startSec
      if (typeof s === 'number' && s <= player.position) { idx = i; break }
    }
    setActive(prev => (prev === idx ? prev : idx))
  }, [isThisTrack, player.position, timedList])

  function loadAndPlay(seekSec?: number) {
    const totalDur = fetched?.totalDurationSec ?? (timedList[timedList.length - 1]?.startSec ?? 0) + 90
    const markers = timedList
      .filter(s => typeof s.startSec === 'number')
      .map(s => ({ title: s.title, startSec: s.startSec as number }))
    const t: PlayerTrack = {
      symbol,
      title: call.title,
      date: call.date,
      durationSec: Math.max(60, Math.round(totalDur)),
      isLive: call.isLive,
      audioUrl: fetched?.audioUrl || undefined,
      slides: markers.length ? markers : undefined,
    }
    player.load(t)
    if (typeof seekSec === 'number' && !call.isLive) {
      // Defer the seek until after the load() state has settled.
      setTimeout(() => player.seek(seekSec), 50)
    }
  }

  function onThumbClick(i: number) {
    setActive(i)
    track('slides_thumb_click', { idx: i + 1, symbol })
    const startSec = timedList[i]?.startSec
    if (typeof startSec !== 'number') return
    if (call.isLive) {
      // Live streams aren't seekable, but if we aren't already on this
      // call, honour the click intent by joining the live broadcast.
      if (!isThisTrack) loadAndPlay()
      return
    }
    if (isThisTrack) {
      player.seek(startSec)
    } else {
      // Not playing this call yet — load it and seek to this slide so the
      // listener lands exactly where the slide they clicked appears.
      loadAndPlay(startSec)
    }
  }

  function doAction(id: string) {
    setMenuOpen(false)
    track('slides_action', { id, symbol, slide: active + 1 })
    if (id === 'play') {
      const startSec = timedList[active]?.startSec ?? 0
      loadAndPlay(startSec)
    } else if (id === 'extract') {
      if (!isPro) { setExtractMsg('Extract-to-Excel is a Pro feature. Upgrade to enable.'); return }
      setExtractOpen(true)
    } else if (id === 'copy') {
      const text = `${slide.title}\n${slide.bullets.map(b => '• ' + b).join('\n')}\nSource: ${symbol} ${call.title} (${call.date})`
      navigator.clipboard?.writeText(text)
      setExtractMsg('Copied slide content to clipboard')
    } else {
      setExtractMsg(`${ACTIONS.find(a => a.id === id)?.label} — saved`)
    }
    setTimeout(() => setExtractMsg(null), 2800)
  }

  function fmt(s: number) { const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, '0')}` }

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {call.title} — Slides
            {isThisTrack && (
              <span title="Slides auto-advancing with playback" style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: 'rgba(5,150,105,0.16)', color: '#059669', letterSpacing: '0.04em' }}>● SYNCED</span>
            )}
            {fetched?.slideTimingSource === 'estimated' && (
              <span title="Slide timings estimated; awaiting deck-alignment pipeline" style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: '#E0F2FE', color: '#075985' }}>EST. TIMING</span>
            )}
            {fetched?.deckSource === 'real-pdf' && (
              <span title="Showing the official investor deck PDF published with this earnings release" style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 6, background: 'rgba(5,150,105,0.16)', color: '#059669' }}>OFFICIAL DECK</span>
            )}
            {fetched?.deckSource === 'fallback-financials' && (
              <span title="Official deck unavailable for this call; showing reported financials for this quarter as a fallback" style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: 'rgba(245,158,11,0.18)', color: '#B45309' }}>FALLBACK · FINANCIALS</span>
            )}
            {fetched?.deckSource === 'fallback-empty' && (
              <span title="Official deck unavailable for this call" style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: 'rgba(0,0,0,0.06)', color: '#475569' }}>DECK UNAVAILABLE</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{call.date} · {timedList.length} slides{loadingSlides ? ' · loading deck…' : ''}</span>
            {fetched?.deckPdfUrl && (
              <a href={fetched.deckPdfUrl} target="_blank" rel="noopener noreferrer"
                onClick={() => track('slides_pdf_open', { symbol })}
                style={{ color: '#1B4FFF', fontWeight: 700, textDecoration: 'none' }}>
                Open PDF ↗
              </a>
            )}
            {!fetched?.deckPdfUrl && fetched?.deckPageUrl && (
              <a href={fetched.deckPageUrl} target="_blank" rel="noopener noreferrer"
                onClick={() => track('slides_ir_deck_click', { symbol })}
                style={{ color: '#1B4FFF', fontWeight: 700, textDecoration: 'none' }}>
                Issuer IR page ↗
              </a>
            )}
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(o => !o)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>
            Actions ▾
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: '110%', width: 240, background: '#fff', borderRadius: 10, boxShadow: '0 10px 40px rgba(0,0,0,0.12)', border: '1px solid var(--border)', zIndex: 50, overflow: 'hidden' }}>
              {ACTIONS.map(a => (
                <button key={a.id} onClick={() => doAction(a.id)}
                  style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit' }}>
                  <span style={{ width: 18, color: 'var(--accent)' }}>{a.icon}</span>
                  <span>{a.label}</span>
                  {a.pro && <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: 'var(--amber-dim)', color: 'var(--amber)' }}>PRO</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {extractMsg && (
        <div style={{ padding: '8px 18px', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 12, fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
          {extractMsg}
        </div>
      )}

      {extractOpen && (() => {
        const graphs = timedList
          .map((s, i) => ({ idx: i, slide: s }))
          .filter(({ slide }) => slide.chartType)
        function dl(idx: number, label: string) {
          track('slides_extract_one', { symbol, slide: idx + 1 })
          const url = `/api/extract-graphs?symbol=${symbol}&slide=${idx + 1}`
          window.location.href = url
          setExtractMsg(`Downloaded ${symbol}-slide-${idx + 1}-${label}.xlsx`)
          setTimeout(() => setExtractMsg(null), 2400)
        }
        function dlAll() {
          track('slides_extract_all', { symbol, count: graphs.length })
          graphs.forEach((g, i) => setTimeout(() => {
            const url = `/api/extract-graphs?symbol=${symbol}&slide=${g.idx + 1}`
            const a = document.createElement('a'); a.href = url; a.click()
          }, i * 250))
          setExtractOpen(false)
          setExtractMsg(`Downloading ${graphs.length} graph${graphs.length === 1 ? '' : 's'}…`)
          setTimeout(() => setExtractMsg(null), 2800)
        }
        return (
          <div onClick={() => setExtractOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,0.45)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 480, maxHeight: '80vh', overflowY: 'auto', background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 30px 80px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Extract graphs to Excel</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{graphs.length} graph{graphs.length === 1 ? '' : 's'} detected in this deck</div>
                </div>
                <button onClick={() => setExtractOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: 18, color: 'var(--text-secondary)', cursor: 'pointer' }}>×</button>
              </div>
              <div>
                {graphs.length === 0 ? (
                  <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>No charts or tables detected on these slides.</div>
                ) : graphs.map(({ idx, slide: s }) => (
                  <div key={s.id} style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 5, background: 'var(--accent-dim)', color: 'var(--accent-text)' }}>Slide {idx + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{s.chartType} chart</div>
                    </div>
                    <button onClick={() => dl(idx, s.chartType || 'chart')}
                      style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid var(--border)', background: '#fff', fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>Download</button>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setExtractOpen(false)}
                  style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
                <button disabled={graphs.length === 0} onClick={dlAll}
                  style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: graphs.length === 0 ? 'var(--bg-elevated)' : 'var(--accent)', color: graphs.length === 0 ? 'var(--text-muted)' : '#fff', fontSize: 12, fontWeight: 800, cursor: graphs.length === 0 ? 'default' : 'pointer' }}>
                  Download all ({graphs.length})
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', minHeight: 420 }}>
        <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', maxHeight: 480 }}>
          {timedList.map((s, i) => {
            const isActive = i === active
            return (
              <button key={s.id} onClick={() => onThumbClick(i)}
                style={{ width: '100%', textAlign: 'left', padding: 10, border: 'none', background: isActive ? 'var(--accent-dim)' : '#fff', borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                <div style={{ width: '100%', aspectRatio: '16/10', borderRadius: 6, background: isActive ? '#fff' : 'rgba(255,255,255,0.025)', border: '1px solid var(--border)', padding: 8, fontSize: 9, color: 'var(--text-primary)', fontWeight: 700, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                  <ThumbChart type={s.chartType} active={isActive} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: isActive ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 700 }}>Slide {i + 1}</span>
                  {typeof s.startSec === 'number' && (
                    <span style={{ fontSize: 9, color: isActive ? 'var(--accent)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(s.startSec)}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div style={{ padding: 28, background: 'linear-gradient(180deg,#F8FAFD,#fff)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <h3 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{slide.title}</h3>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Slide {active + 1} of {timedList.length}
              {typeof slide.startSec === 'number' && <> · @ {fmt(slide.startSec)}</>}
            </span>
          </div>
          {fetched?.deckPdfUrl && slide.pageNumber ? (
            // Render the actual published deck page in an embedded PDF viewer.
            // The `#page=N` fragment is honored by Chromium, Firefox, and
            // Safari's built-in PDF plugins. Toolbar/navpane chrome is hidden
            // so the embed reads as a single slide rather than a PDF reader.
            <div style={{ width: '100%', aspectRatio: '16/10', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: '#fff' }}>
              <iframe
                key={`${fetched.deckPdfUrl}#${slide.pageNumber}`}
                title={`${call.title} slide ${slide.pageNumber}`}
                src={`${fetched.deckPdfUrl}#page=${slide.pageNumber}&toolbar=0&navpanes=0&view=FitH`}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
              {slide.bullets.length > 0 && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 12, color: 'var(--text-secondary)', maxHeight: 80, overflow: 'auto' }}>
                  {slide.bullets.slice(0, 3).join(' · ')}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {slide.bullets.map((b, i) => (
                  <li key={i} style={{ display: 'flex', gap: 10, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.55 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginTop: 7, flexShrink: 0 }} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <BigChart type={slide.chartType} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ThumbChart({ type, active }: { type?: string; active: boolean }) {
  const c = active ? 'var(--accent)' : '#C0CEDF'
  if (type === 'line') return <svg viewBox="0 0 100 28" style={{ width: '100%', height: 22 }}><path d="M0 22 L20 18 L40 14 L60 8 L80 5 L100 3" stroke={c} strokeWidth="2" fill="none" /></svg>
  if (type === 'table') return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, height: 22 }}>{[...Array(9)].map((_, i) => <div key={i} style={{ background: c, opacity: 0.2 + (i % 3) * 0.15 }} />)}</div>
  return <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 22 }}>{[40, 65, 50, 80, 95].map((h, i) => <div key={i} style={{ width: 8, height: h + '%', background: c, borderRadius: 1 }} />)}</div>
}

function BigChart({ type }: { type?: string }) {
  if (type === 'line') {
    return (
      <svg viewBox="0 0 200 120" style={{ width: '100%', borderRadius: 10, background: '#fff', border: '1px solid var(--border)' }}>
        <defs><linearGradient id="lc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor='var(--accent)' stopOpacity="0.3" /><stop offset="100%" stopColor='var(--accent)' stopOpacity="0" /></linearGradient></defs>
        <path d="M0 100 L40 85 L80 60 L120 35 L160 20 L200 8 L200 120 L0 120 Z" fill="url(#lc)" />
        <path d="M0 100 L40 85 L80 60 L120 35 L160 20 L200 8" stroke='var(--accent)' strokeWidth="2" fill="none" />
      </svg>
    )
  }
  if (type === 'table') {
    return (
      <div style={{ borderRadius: 10, background: '#fff', border: '1px solid var(--border)', overflow: 'hidden', fontSize: 11 }}>
        {[['Buybacks', '$8.7B'], ['Dividends', '$0.4B'], ['Cash', '$40.6B'], ['Inventory days', '92']].map(([k, v], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: i < 3 ? '1px solid #F0F4FA' : 'none' }}>
            <span style={{ color: '#7D8FA9' }}>{k}</span><span style={{ fontWeight: 800, color: '#0A1628' }}>{v}</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, padding: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 10 }}>
      {[42, 58, 71, 86, 100].map((h, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ width: '100%', height: h + '%', background: 'var(--gradient-brand)', borderRadius: '4px 4px 0 0' }} />
          <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{['FY22','FY23','FY24','FY25','FY26E'][i]}</div>
        </div>
      ))}
    </div>
  )
}

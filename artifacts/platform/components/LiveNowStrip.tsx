'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/analytics'

interface LiveItem {
  id: string
  symbol: string
  name: string
  type: 'earnings' | 'cmd' | 'conference'
  startsAt: string
  endsAt: string
  status: 'live' | 'upcoming' | 'ended'
  audioAvailable: boolean
  country?: string
  year?: number
  quarter?: number
  listeners?: number
}

const TYPE_LABEL: Record<LiveItem['type'], string> = {
  earnings: 'Earnings',
  cmd: 'CMD',
  conference: 'Conf.',
}
const TYPE_TONE: Record<LiveItem['type'], { bg: string; fg: string }> = {
  earnings: { bg: 'rgba(27,79,255,0.2)', fg: '#93B4FF' },
  cmd: { bg: 'rgba(124,58,237,0.2)', fg: '#C4B5FD' },
  conference: { bg: 'rgba(13,159,232,0.2)', fg: '#7DD3FC' },
}

function fmtMins(diffMs: number): string {
  const m = Math.round(Math.abs(diffMs) / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return mm ? `${h}h ${mm}m` : `${h}h`
}

export default function LiveNowStrip({ pollMs = 30_000, showJustEnded = true }: { pollMs?: number; showJustEnded?: boolean }) {
  const [live, setLive] = useState<LiveItem[]>([])
  const [upcoming, setUpcoming] = useState<LiveItem[]>([])
  const [ended, setEnded] = useState<LiveItem[]>([])
  const [refreshedAt, setRefreshedAt] = useState<string>('')

  async function load() {
    try {
      const res = await fetch((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/api/live-events')
      const data = await res.json()
      setLive(Array.isArray(data.live) ? data.live : [])
      setUpcoming(Array.isArray(data.upcoming) ? data.upcoming.slice(0, 8) : [])
      setEnded(Array.isArray(data.ended) ? data.ended.slice(0, 6) : [])
      setRefreshedAt(data.refreshedAt || '')
    } catch {}
  }
  useEffect(() => {
    load()
    const id = setInterval(load, pollMs)
    return () => clearInterval(id)
  }, [pollMs])

  if (!live.length && !upcoming.length && !(showJustEnded && ended.length)) {
    return (
      <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: '#7B96B8', fontSize: 12 }}>
        No companies live right now and nothing on the next-24h schedule. Polling every {Math.round(pollMs / 1000)}s.
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 14, background: 'linear-gradient(135deg, rgba(248,113,113,0.06), rgba(27,79,255,0.04))', border: '1px solid rgba(248,113,113,0.18)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, background: 'rgba(248,113,113,0.18)', color: 'var(--neg)', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--neg)', boxShadow: '0 0 8px rgba(248,113,113,0.8)', animation: 'liveDot 1.4s infinite' }} />
          Live right now
        </span>
        <span style={{ fontSize: 11, color: '#7B96B8' }}>{live.length} on a call · {upcoming.length} coming up in 24h</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4A6280' }}>
          {refreshedAt ? `refreshed ${new Date(refreshedAt).toLocaleTimeString()}` : ''}
        </span>
      </div>

      {live.length > 0 && (
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 4 }}>
          {live.map(it => {
            const minsIn = Math.max(0, Math.floor((Date.now() - new Date(it.startsAt).getTime()) / 60_000))
            const tone = TYPE_TONE[it.type]
            return (
              <Link key={it.id} href={`/app/live/${encodeURIComponent(it.id)}`}
                onClick={() => track('live_now_open', { symbol: it.symbol, type: it.type, id: it.id })}
                style={{ flexShrink: 0, width: 96, textAlign: 'center', textDecoration: 'none' }}>
                <div style={{ width: 64, height: 64, margin: '0 auto', borderRadius: '50%', padding: 3, background: 'conic-gradient(var(--neg), var(--neg), var(--neg))', position: 'relative', animation: 'livePulse 2.2s ease-in-out infinite' }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 900, letterSpacing: '-0.02em' }}>
                    {it.symbol.slice(0, 4)}
                  </div>
                  <span style={{ position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)', background: 'var(--neg)', color: '#fff', fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 8, letterSpacing: '0.04em' }}>LIVE</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: '#E2EEFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.symbol}</div>
                <div style={{ display: 'inline-block', marginTop: 3, fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 8, background: tone.bg, color: tone.fg }}>{TYPE_LABEL[it.type]}</div>
                <div style={{ fontSize: 10, color: '#7B96B8', marginTop: 2 }}>{minsIn}m in</div>
              </Link>
            )
          })}
        </div>
      )}

      {upcoming.length > 0 && (
        <div style={{ marginTop: live.length ? 14 : 0, paddingTop: live.length ? 12 : 0, borderTop: live.length ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#7B96B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Coming up in 24h</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {upcoming.map(it => {
              const startsIn = new Date(it.startsAt).getTime() - Date.now()
              const tone = TYPE_TONE[it.type]
              return (
                <Link key={it.id} href={`/app/live/${encodeURIComponent(it.id)}`}
                  onClick={() => track('live_upcoming_open', { symbol: it.symbol, type: it.type, id: it.id })}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', textDecoration: 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 900, flexShrink: 0 }}>
                    {it.symbol.slice(0, 4)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#E2EEFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.symbol} <span style={{ color: '#7B96B8', fontWeight: 500 }}>· in {fmtMins(startsIn)}</span></div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: tone.bg, color: tone.fg }}>{TYPE_LABEL[it.type]}</span>
                      {it.country && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', color: '#7B96B8' }}>{it.country}</span>}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {showJustEnded && ended.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#7B96B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Just ended</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {ended.map(it => {
              const endedMins = Math.max(0, Math.floor((Date.now() - new Date(it.endsAt).getTime()) / 60_000))
              const tone = TYPE_TONE[it.type]
              return (
                <Link key={it.id} href={`/app/live/${encodeURIComponent(it.id)}`}
                  onClick={() => track('live_ended_open', { symbol: it.symbol, type: it.type, id: it.id })}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', textDecoration: 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 7, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7B96B8', fontSize: 10, fontWeight: 900, flexShrink: 0 }}>
                    {it.symbol.slice(0, 4)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#E2EEFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.symbol} <span style={{ color: '#7B96B8', fontWeight: 500 }}>· {fmtMins(endedMins)} ago</span></div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: tone.bg, color: tone.fg }}>{TYPE_LABEL[it.type]}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: 'rgba(255,255,255,0.04)', color: '#7B96B8' }}>Replay</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes liveDot { 0%,100% { opacity:1 } 50% { opacity:0.35 } }
        @keyframes livePulse { 0%,100% { box-shadow: 0 0 0 0 rgba(248,113,113,0.5) } 50% { box-shadow: 0 0 0 6px rgba(248,113,113,0) } }
      `}</style>
    </div>
  )
}

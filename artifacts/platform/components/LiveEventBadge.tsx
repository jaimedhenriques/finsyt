'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/analytics'

interface LiveItem {
  id: string
  symbol: string
  type: 'earnings' | 'cmd' | 'conference'
  status: 'live' | 'upcoming' | 'ended'
  startsAt: string
  endsAt: string
  audioAvailable: boolean
}

const TYPE_LABEL: Record<LiveItem['type'], string> = {
  earnings: 'Earnings call',
  cmd: 'Capital markets day',
  conference: 'Investor conference',
}

function fmtCountdown(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

/**
 * Compact "Listen live / Coming up" affordance for a company workspace
 * header. Polls /api/live-events?symbol=… every 30s. Renders nothing when
 * the symbol has no live or near-future event.
 */
export default function LiveEventBadge({ symbol, pollMs = 30_000 }: { symbol: string; pollMs?: number }) {
  const [items, setItems] = useState<LiveItem[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
        const res = await fetch(`${base}/api/live-events?symbol=${encodeURIComponent(symbol)}`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const live = Array.isArray(data.live) ? data.live : []
        const upcoming = Array.isArray(data.upcoming) ? data.upcoming : []
        // Show a single badge: live wins, otherwise the soonest upcoming.
        if (live.length) setItems([live[0]])
        else if (upcoming.length) setItems([upcoming[0]])
        else setItems([])
      } catch {}
    }
    load()
    const id = setInterval(load, pollMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [symbol, pollMs])

  if (items.length === 0) return null
  const it = items[0]
  const isLive = it.status === 'live'
  const startsIn = new Date(it.startsAt).getTime() - Date.now()

  return (
    <Link href={`/app/live/${encodeURIComponent(it.id)}`}
      onClick={() => track(isLive ? 'company_listen_live' : 'company_listen_upcoming', { symbol, id: it.id })}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', borderRadius: 999,
        background: isLive ? 'rgba(248,113,113,0.18)' : 'rgba(27,79,255,0.16)',
        border: `1px solid ${isLive ? 'rgba(248,113,113,0.35)' : 'rgba(27,79,255,0.35)'}`,
        color: isLive ? 'var(--neg)' : '#93B4FF',
        fontSize: 11, fontWeight: 800, letterSpacing: '0.02em',
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}
      title={`${TYPE_LABEL[it.type]} · ${isLive ? 'live now' : `starts in ${fmtCountdown(startsIn)}`}`}>
      {isLive
        ? <>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--neg)', boxShadow: '0 0 8px rgba(248,113,113,0.8)', animation: 'liveDot 1.4s infinite' }} />
            Listen live
          </>
        : <>
            <span style={{ fontSize: 11 }}>▶</span>
            Listen in {fmtCountdown(startsIn)}
          </>
      }
      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: 'inherit', opacity: 0.85 }}>
        {it.type === 'earnings' ? 'Earnings' : it.type === 'cmd' ? 'CMD' : 'Conf.'}
      </span>
      <style>{`@keyframes liveDot { 0%,100% { opacity:1 } 50% { opacity:0.35 } }`}</style>
    </Link>
  )
}

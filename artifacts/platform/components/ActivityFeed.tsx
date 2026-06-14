'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/analytics'

interface ActivityItem {
  id?: string
  symbol: string
  name: string
  type: string
  eventType?: 'earnings' | 'cmd' | 'conference'
  detail: string
  ago: number
  ts: string
}

function fmtAgo(min: number) {
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function ActivityFeed({ pollMs = 30_000, limit = 8 }: { pollMs?: number; limit?: number }) {
  const [items, setItems] = useState<ActivityItem[]>([])

  async function load() {
    try {
      const res = await fetch((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/api/live-events')
      const data = await res.json()
      setItems((data.activity || []).slice(0, limit))
    } catch {}
  }
  useEffect(() => {
    load()
    const id = setInterval(load, pollMs)
    return () => clearInterval(id)
  }, [pollMs, limit])

  return (
    <div style={{ borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#E2EEFF', letterSpacing: '-0.01em' }}>Activity feed</span>
        <span style={{ fontSize: 10, color: '#4A6280' }}>real-time</span>
      </div>
      <div>
        {items.map((it, i) => (
          <Link key={i} href={it.id ? `/app/live/${encodeURIComponent(it.id)}` : `/app/company/${it.symbol}`}
            onClick={() => track('activity_feed_open', { symbol: it.symbol, type: it.type, id: it.id })}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', textDecoration: 'none' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: '#fff' }}>
              {it.symbol.slice(0, 3)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#E2EEFF' }}>
                <span style={{ fontWeight: 700 }}>{it.name}</span>{' '}
                <span style={{ color: '#7B96B8' }}>{it.type}</span>{' '}
                <span style={{ color: '#93B4FF' }}>· {it.detail}</span>
              </div>
              <div style={{ fontSize: 10, color: '#4A6280', marginTop: 2 }}>{fmtAgo(it.ago)}</div>
            </div>
            <span style={{ color: '#4A6280', fontSize: 12 }}>›</span>
          </Link>
        ))}
        {items.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#7B96B8', fontSize: 12 }}>Loading activity...</div>}
      </div>
    </div>
  )
}

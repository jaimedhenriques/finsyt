'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/analytics'

interface LiveItem { symbol: string; name: string; sector: string; event: string; startedAt: string; listeners: number }

export default function LiveNowStrip({ pollMs = 30_000 }: { pollMs?: number }) {
  const [live, setLive] = useState<LiveItem[]>([])
  const [refreshedAt, setRefreshedAt] = useState<string>('')

  async function load() {
    try {
      const res = await fetch((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/api/live-events')
      const data = await res.json()
      setLive(data.live || [])
      setRefreshedAt(data.refreshedAt || '')
    } catch {}
  }
  useEffect(() => {
    load()
    const id = setInterval(load, pollMs)
    return () => clearInterval(id)
  }, [pollMs])

  if (!live.length) {
    return (
      <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: '#7B96B8', fontSize: 12 }}>
        No companies live right now. Polling every {Math.round(pollMs / 1000)}s for updates.
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
        <span style={{ fontSize: 11, color: '#7B96B8' }}>{live.length} companies on a call</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4A6280' }}>
          {refreshedAt ? `refreshed ${new Date(refreshedAt).toLocaleTimeString()}` : ''}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 4 }}>
        {live.map(it => {
          const minsIn = Math.max(0, Math.floor((Date.now() - new Date(it.startedAt).getTime()) / 60_000))
          return (
            <Link key={it.symbol} href={`/app/company/${it.symbol}?tab=transcripts&live=1`}
              onClick={() => track('live_now_open', { symbol: it.symbol })}
              style={{ flexShrink: 0, width: 88, textAlign: 'center', textDecoration: 'none' }}>
              <div style={{ width: 64, height: 64, margin: '0 auto', borderRadius: '50%', padding: 3, background: 'conic-gradient(var(--neg), var(--neg), var(--neg))', position: 'relative', animation: 'livePulse 2.2s ease-in-out infinite' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 900, letterSpacing: '-0.02em' }}>
                  {it.symbol.slice(0, 4)}
                </div>
                <span style={{ position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)', background: 'var(--neg)', color: '#fff', fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 8, letterSpacing: '0.04em' }}>LIVE</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: '#E2EEFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.symbol}</div>
              <div style={{ fontSize: 10, color: '#7B96B8' }}>{minsIn}m in</div>
            </Link>
          )
        })}
      </div>
      <style>{`
        @keyframes liveDot { 0%,100% { opacity:1 } 50% { opacity:0.35 } }
        @keyframes livePulse { 0%,100% { box-shadow: 0 0 0 0 rgba(248,113,113,0.5) } 50% { box-shadow: 0 0 0 6px rgba(248,113,113,0) } }
      `}</style>
    </div>
  )
}

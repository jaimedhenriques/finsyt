'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface MoverRow { symbol: string; name?: string; pct: number; reason?: string }
interface NewsRow  { title: string; source?: string; symbol?: string; href?: string }

function fmtPct(n: number) {
  const s = n >= 0 ? '+' : ''
  return `${s}${n.toFixed(2)}%`
}

export default function WhatChangedBlock() {
  // No seeded fallback data — the previous FALLBACK_MOVERS / FALLBACK_NEWS
  // arrays contained company-specific fake values (e.g. "NVDA +3.42%
  // Blackwell shipments commentary") that lingered forever because no
  // /api/markets/movers endpoint exists. We now render an explicit loading
  // → empty-state path and only show real upstream rows.
  const [movers, setMovers] = useState<MoverRow[]>([])
  const [news,   setNews]   = useState<NewsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [moversError, setMoversError] = useState(false)
  const [newsError, setNewsError]     = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      // Use the general latest news as a proxy for "what changed" — the
      // dedicated movers endpoint isn't shipped yet, so the movers panel
      // intentionally stays empty rather than showing fabricated tickers.
      fetch('/api/news?limit=3', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
    ]).then(([n]) => {
      if (cancelled) return
      // Movers: nothing to render yet. Mark error so the empty state shows
      // a clear "coming soon" message instead of an indefinite spinner.
      setMoversError(true)
      if (n.status === 'fulfilled' && n.value) {
        const arr = Array.isArray(n.value) ? n.value : (n.value.articles || n.value.items || n.value.news || [])
        if (arr.length) {
          setNews(arr.slice(0, 3).map((a: any) => ({
            title: a.title || a.headline || 'News update',
            source: a.source || a.publisher,
            symbol: a.symbol || a.ticker || (Array.isArray(a.tickers) && a.tickers[0]),
            href: '/app/news',
          })))
        } else {
          setNewsError(true)
        }
      } else {
        setNewsError(true)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const renderEmpty = (label: string) => (
    <div style={{
      padding: '14px 12px',
      border: '1px dashed var(--border)',
      borderRadius: 10,
      fontSize: 12,
      color: 'var(--text-muted)',
      textAlign: 'center',
      background: 'var(--bg-elevated)',
    }}>
      {label}
    </div>
  )

  return (
    <div style={{
      display:'grid', gridTemplateColumns:'minmax(0, 1.2fr) minmax(0, 1fr)',
      gap:18,
      background:'var(--bg-card)', border:'1px solid var(--border)',
      borderRadius:14, padding:20,
    }}>
      {/* Header spans both */}
      <div style={{ gridColumn:'1 / -1', display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', color:'var(--accent-text)', textTransform:'uppercase' }}>
            What changed since you last visited
          </div>
          <div style={{ fontSize:18, fontWeight:700, color:'var(--text-primary)', marginTop:4, letterSpacing:'-0.01em' }}>
            Your coverage in motion
          </div>
        </div>
        <Link href="/app/markets" style={{
          fontSize:12, fontWeight:600, color:'var(--accent-text)', textDecoration:'none',
        }}>Open Markets →</Link>
      </div>

      {/* Movers */}
      <div>
        <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'0.08em', color:'var(--text-muted)', textTransform:'uppercase', marginBottom:8 }}>
          Watchlist movers
        </div>
        <div style={{ display:'flex', flexDirection:'column' }}>
          {loading && movers.length === 0 && !moversError && (
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:6 }}>Loading…</div>
          )}
          {!loading && movers.length === 0 && renderEmpty('Watchlist movers will appear here once the movers feed is wired up.')}
          {movers.map((m, i) => (
            <Link key={m.symbol} href={`/app/c/${m.symbol}`} style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'10px 0', textDecoration:'none',
              borderTop: i === 0 ? '1px solid var(--border)' : 'none',
              borderBottom:'1px solid var(--border)',
            }}>
              <span style={{
                width:34, height:34, borderRadius:8,
                background: m.pct >= 0 ? 'var(--pos-dim)' : 'var(--neg-dim, rgba(239,68,68,0.12))',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:10, fontWeight:800,
                color: m.pct >= 0 ? 'var(--pos)' : 'var(--neg, #ef4444)',
                flexShrink:0,
              }}>{m.symbol.slice(0, 4)}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{m.symbol}{m.name ? <span style={{ color:'var(--text-muted)', fontWeight:500, marginLeft:6 }}>{m.name}</span> : null}</div>
                {m.reason && (
                  <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.reason}</div>
                )}
              </div>
              <span style={{
                fontSize:13, fontWeight:800,
                color: m.pct >= 0 ? 'var(--pos)' : 'var(--neg, #ef4444)',
                fontVariantNumeric:'tabular-nums',
              }}>{fmtPct(m.pct)}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* News */}
      <div>
        <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'0.08em', color:'var(--text-muted)', textTransform:'uppercase', marginBottom:8 }}>
          Headlines for your coverage
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {loading && news.length === 0 && !newsError && (
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>Loading headlines…</div>
          )}
          {!loading && news.length === 0 && renderEmpty('No live headlines from the news provider right now.')}
          {news.map((n, i) => (
            <Link key={i} href={n.href || '/app/news'} style={{
              display:'block', textDecoration:'none',
              padding:'10px 12px', borderRadius:10,
              border:'1px solid var(--border)', background:'var(--bg-elevated)',
              transition:'border-color 0.12s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
            >
              <div style={{ fontSize:12.5, fontWeight:600, color:'var(--text-primary)', lineHeight:1.45 }}>{n.title}</div>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
                {n.source}{n.symbol ? ` · ${n.symbol}` : ''}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

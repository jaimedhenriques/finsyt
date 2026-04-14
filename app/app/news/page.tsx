'use client'
import { useEffect, useState, useCallback } from 'react'

interface Article {
  title:       string
  url:         string
  source:      string
  summary?:    string
  sentiment?:  string
  sentimentScore?: number
  publishedAt: string
  tickers?:    string[]
  banner?:     string
}

interface EarningsEvent {
  symbol:      string
  name?:       string
  date:        string
  epsEstimate?: number
  epsActual?:   number
  revenueEstimate?: number
  time?:       string
}

const TOPICS = [
  { id:'financial_markets', label:'Markets'    },
  { id:'earnings',          label:'Earnings'   },
  { id:'mergers_and_acquisitions', label:'M&A' },
  { id:'ipo',               label:'IPO'        },
  { id:'technology',        label:'Technology' },
  { id:'economy_macro',     label:'Macro'      },
  { id:'crypto',            label:'Crypto'     },
]

const sentimentColor  = (s?: string) => !s?'#7D8FA9':s.includes('Bullish')?'#059669':s.includes('Bearish')?'#DC2626':'#D97706'
const sentimentBadge  = (s?: string) => !s?'#F0F4FA':s.includes('Bullish')?'rgba(5,150,105,0.1)':s.includes('Bearish')?'rgba(220,38,38,0.1)':'rgba(217,119,6,0.1)'
const sentimentText   = (s?: string) => !s?'#7D8FA9':s.includes('Bullish')?'#059669':s.includes('Bearish')?'#DC2626':'#D97706'
const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff/60000)
  if (mins < 60)   return `${mins}m ago`
  const hrs = Math.floor(mins/60)
  if (hrs < 24)    return `${hrs}h ago`
  return `${Math.floor(hrs/24)}d ago`
}

export default function NewsPage() {
  const [view, setView]       = useState<'news'|'earnings'>('news')
  const [articles, setArticles] = useState<Article[]>([])
  const [earnings, setEarnings] = useState<EarningsEvent[]>([])
  const [loading, setLoading]   = useState(true)
  const [topic, setTopic]       = useState('financial_markets')
  const [symFilter, setSymFilter] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadNews = useCallback(async () => {
    setLoading(true)
    try {
      const params = symFilter ? `symbol=${symFilter}&limit=30` : `topics=${topic}&limit=30`
      const res  = await fetch('/api/news?' + params)
      const data = await res.json()
      setArticles(data.articles || [])
      setLastUpdated(new Date())
    } catch {}
    setLoading(false)
  }, [topic, symFilter])

  const loadEarnings = useCallback(async () => {
    setLoading(true)
    try {
      const from = new Date().toISOString().split('T')[0]
      const to   = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
      const res  = await fetch(`/api/earnings-calendar?from=${from}&to=${to}`)
      const data = await res.json()
      const raw  = data.earnings?.earnings || data.earnings || []
      setEarnings(Array.isArray(raw) ? raw.slice(0, 60) : [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { if (view === 'news') loadNews() }, [loadNews, view])
  useEffect(() => { if (view === 'earnings') loadEarnings() }, [loadEarnings, view])

  // Auto-refresh news every 3 min
  useEffect(() => {
    if (view !== 'news') return
    const id = setInterval(() => loadNews(), 180_000)
    return () => clearInterval(id)
  }, [loadNews, view])

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title">News & Signals</h1>
          <p style={{ fontSize:13, marginTop:2, color:'#7D8FA9' }}>Real-time news · AI sentiment · earnings calendar</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {lastUpdated && view === 'news' && (
            <span style={{ fontSize:11, color:'#B0BCD0' }}>Updated {lastUpdated.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span>
          )}
          <button onClick={() => view === 'news' ? loadNews() : loadEarnings()}
            style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600, color:'#4A5568' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* View toggle */}
      <div className="tab-bar" style={{ marginBottom:20 }}>
        <button className={`tab-btn ${view==='news'?'active':''}`} onClick={() => setView('news')}>◻ News Feed</button>
        <button className={`tab-btn ${view==='earnings'?'active':''}`} onClick={() => setView('earnings')}>◉ Earnings Calendar</button>
      </div>

      {/* ── NEWS VIEW ──────────────────────────────────────────────────────── */}
      {view === 'news' && (
        <>
          {/* Filters */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
            <div className="tab-bar" style={{ borderBottom:'none', marginBottom:0 }}>
              {TOPICS.map(t => (
                <button key={t.id} className={`tab-btn ${topic===t.id && !symFilter ? 'active' : ''}`}
                  onClick={() => { setTopic(t.id); setSymFilter('') }}>
                  {t.label}
                </button>
              ))}
            </div>
            <input value={symFilter} onChange={e => setSymFilter(e.target.value.toUpperCase())}
              placeholder="Filter by ticker…"
              style={{ width:150, padding:'7px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:12, fontFamily:'inherit', outline:'none', textTransform:'uppercase', marginLeft:'auto' }} />
          </div>

          {/* Articles grid */}
          {loading ? (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))', gap:16 }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} className="card" style={{ padding:20 }}>
                  <div style={{ height:14, borderRadius:4, background:'#F0F4FA', width:'75%', marginBottom:12 }} />
                  <div style={{ height:12, borderRadius:4, background:'#F0F4FA', width:'100%', marginBottom:8 }} />
                  <div style={{ height:12, borderRadius:4, background:'#F0F4FA', width:'60%' }} />
                </div>
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="card" style={{ padding:48, textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📰</div>
              <div style={{ fontWeight:700, fontSize:15, color:'#0A1628' }}>No articles found</div>
              <div style={{ fontSize:13, color:'#7D8FA9', marginTop:4 }}>Try a different topic or check back soon</div>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))', gap:16 }}>
              {articles.map((n, i) => (
                <a key={i} href={n.url} target="_blank" rel="noopener noreferrer"
                  className="card"
                  style={{ display:'block', padding:20, textDecoration:'none', transition:'box-shadow 0.14s' }}>
                  <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      {/* Meta row */}
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                        <span style={{ fontWeight:700, fontSize:11, color:'#1B4FFF' }}>{n.source}</span>
                        <span style={{ fontSize:10, color:'#B0BCD0' }}>·</span>
                        <span style={{ fontSize:11, color:'#B0BCD0' }}>{timeAgo(n.publishedAt)}</span>
                        {n.sentiment && (
                          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20,
                            background: sentimentBadge(n.sentiment), color: sentimentText(n.sentiment) }}>
                            {n.sentiment.replace(/_/g,' ')}
                          </span>
                        )}
                        {n.tickers?.slice(0, 3).map(t => (
                          <span key={t} style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:6, background:'#F0F4FA', color:'#4A5568' }}>{t}</span>
                        ))}
                      </div>
                      {/* Headline */}
                      <h3 style={{ fontWeight:700, fontSize:13, color:'#0A1628', marginBottom:6, lineHeight:1.45 }}>{n.title}</h3>
                      {/* Summary */}
                      {n.summary && (
                        <p style={{ fontSize:12, color:'#7D8FA9', lineHeight:1.55, margin:0 }}>
                          {n.summary.slice(0, 150)}{n.summary.length > 150 ? '…' : ''}
                        </p>
                      )}
                    </div>
                    {/* Thumbnail */}
                    {n.banner && (
                      <img src={n.banner} alt="" style={{ width:72, height:52, borderRadius:8, objectFit:'cover', flexShrink:0 }}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                    )}
                  </div>
                  {/* Footer */}
                  {n.sentimentScore != null && (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', marginTop:10, paddingTop:10, borderTop:'1px solid #F0F4FA', gap:6 }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background: sentimentColor(n.sentiment) }} />
                      <span style={{ fontSize:11, fontWeight:600, color: sentimentColor(n.sentiment) }}>
                        Sentiment: {n.sentimentScore > 0 ? '+' : ''}{n.sentimentScore.toFixed(3)}
                      </span>
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── EARNINGS VIEW ──────────────────────────────────────────────────── */}
      {view === 'earnings' && (
        <div>
          <div className="card" style={{ overflow:'hidden' }}>
            <div style={{ padding:'12px 20px', borderBottom:'1px solid #E2E8F2', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontWeight:700, fontSize:14, color:'#0A1628' }}>Upcoming Earnings (Next 14 Days)</span>
              {loading && <span style={{ fontSize:11, color:'#B0BCD0' }}>Loading…</span>}
            </div>
            {!loading && earnings.length === 0 ? (
              <div style={{ padding:48, textAlign:'center', color:'#B0BCD0', fontSize:13 }}>No earnings data available</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Symbol</th><th>Company</th><th>Date</th><th className="right">EPS Est.</th>
                    <th className="right">EPS Actual</th><th className="right">Rev Est.</th><th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? [...Array(8)].map((_, i) => (
                    <tr key={i}>{[...Array(7)].map((_,j) => <td key={j}><div style={{height:14,borderRadius:4,background:'#F0F4FA'}} /></td>)}</tr>
                  )) : earnings.map((e, i) => (
                    <tr key={i} style={{ cursor:'pointer' }} onClick={() => window.location.href = `/app/company/${e.symbol}`}>
                      <td style={{ fontWeight:700, fontSize:13, color:'#1B4FFF' }}>{e.symbol}</td>
                      <td style={{ fontSize:12, color:'#7D8FA9' }}>{e.name || '—'}</td>
                      <td style={{ fontSize:13, fontWeight:600, color:'#0A1628' }}>{e.date}</td>
                      <td className="right" style={{ fontSize:13, color:'#4A5568' }}>{e.epsEstimate != null ? `$${e.epsEstimate.toFixed(2)}` : '—'}</td>
                      <td className="right" style={{ fontSize:13, fontWeight:700, color: e.epsActual != null ? (e.epsActual >= (e.epsEstimate||0) ? '#059669' : '#DC2626') : '#B0BCD0' }}>
                        {e.epsActual != null ? `$${e.epsActual.toFixed(2)}` : '—'}
                      </td>
                      <td className="right" style={{ fontSize:13, color:'#4A5568' }}>{e.revenueEstimate ? `$${(e.revenueEstimate/1e9).toFixed(2)}B` : '—'}</td>
                      <td>
                        {e.time && (
                          <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:20,
                            background: e.time.includes('Before') ? 'rgba(27,79,255,0.08)' : 'rgba(217,119,6,0.08)',
                            color:      e.time.includes('Before') ? '#1B4FFF' : '#D97706' }}>
                            {e.time}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback } from 'react'

type Article = {
  title: string
  date: string
  source: string
  url?: string
  link?: string
  sentiment?: any
  content?: string
  symbols?: string[]
  tags?: string[]
}

const TOPICS = ['All', 'Technology', 'Finance', 'Energy', 'Healthcare', 'Macro', 'Crypto', 'AI']
const TICKERS = ['', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'META', 'AMZN', 'GOOGL', 'JPM', 'BTC-USD']

function sentimentColor(s: any): string {
  const p = typeof s === 'string' ? s : s?.polarity
  if (p === 'positive') return '#059669'
  if (p === 'negative') return '#EF4444'
  return '#D97706'
}

function sentimentLabel(s: any): string {
  const p = typeof s === 'string' ? s : s?.polarity
  if (p === 'positive') return '📈 Bullish'
  if (p === 'negative') return '📉 Bearish'
  return '⚖️ Neutral'
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 3600)  return `${Math.round(diff/60)}m ago`
  if (diff < 86400) return `${Math.round(diff/3600)}h ago`
  return `${Math.round(diff/86400)}d ago`
}

export default function NewsPage() {
  const [articles, setArticles]     = useState<Article[]>([])
  const [loading, setLoading]       = useState(true)
  const [ticker, setTicker]         = useState('')
  const [topic, setTopic]           = useState('All')
  const [sentiment, setSentiment]   = useState<'all'|'positive'|'negative'|'neutral'>('all')
  const [limit, setLimit]           = useState(30)
  const [expanded, setExpanded]     = useState<number | null>(null)

  const fetchNews = useCallback(async (sym = ticker, lim = limit) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(lim) })
      if (sym) params.set('symbol', sym)
      const res  = await fetch(`/api/news?${params}`)
      const data = await res.json()
      setArticles(data?.articles || data || [])
    } catch { setArticles([]) }
    setLoading(false)
  }, [ticker, limit])

  useEffect(() => { fetchNews() }, [])

  function applyFilters(a: Article): boolean {
    if (sentiment !== 'all') {
      const p = typeof a.sentiment === 'string' ? a.sentiment : a.sentiment?.polarity
      if (p !== sentiment) return false
    }
    if (topic !== 'All') {
      const haystack = `${a.title} ${a.content} ${a.tags?.join(' ')}`.toLowerCase()
      if (!haystack.includes(topic.toLowerCase())) return false
    }
    return true
  }

  const filtered = articles.filter(applyFilters)

  const positiveCount = articles.filter(a => (a.sentiment?.polarity || a.sentiment) === 'positive').length
  const negativeCount = articles.filter(a => (a.sentiment?.polarity || a.sentiment) === 'negative').length
  const sentimentScore = articles.length ? Math.round((positiveCount / articles.length) * 100) : 50

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="page-title">Market News</h1>
          <p style={{ color:'#7D8FA9', fontSize:13 }}>Real-time financial news with AI sentiment scoring · EODHD</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'#059669', animation:'pulse 2s infinite' }} />
          <span style={{ fontSize:12, fontWeight:600, color:'#059669' }}>Live Feed</span>
        </div>
      </div>

      {/* Sentiment gauge */}
      {articles.length > 0 && (
        <div className="card p-4 mb-5">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
            <div>
              <div style={{ fontSize:12, color:'#7D8FA9', marginBottom:4 }}>Market Sentiment Score ({articles.length} articles)</div>
              <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ fontSize:28, fontWeight:900, color: sentimentScore>55?'#059669':sentimentScore<45?'#EF4444':'#D97706', letterSpacing:'-0.02em' }}>
                  {sentimentScore}/100
                </div>
                <div style={{ fontSize:13, fontWeight:700, color: sentimentScore>55?'#059669':sentimentScore<45?'#EF4444':'#D97706' }}>
                  {sentimentScore > 55 ? '📈 Overall Bullish' : sentimentScore < 45 ? '📉 Overall Bearish' : '⚖️ Mixed Sentiment'}
                </div>
              </div>
              <div style={{ width:200, height:6, background:'#E8EDF5', borderRadius:4, marginTop:8, overflow:'hidden' }}>
                <div style={{ width:`${sentimentScore}%`, height:'100%', background:`linear-gradient(90deg, #EF4444, #D97706, #059669)`, borderRadius:4 }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:'20px' }}>
              {[['📈 Bullish', positiveCount, '#059669'], ['📉 Bearish', negativeCount, '#EF4444'], ['⚖️ Neutral', articles.length-positiveCount-negativeCount, '#D97706']].map(([l,v,c])=>(
                <div key={String(l)} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:20, fontWeight:900, color:String(c), letterSpacing:'-0.02em' }}>{v}</div>
                  <div style={{ fontSize:11, color:'#7D8FA9' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-5">
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div>
            <label className="label mb-1 block">Filter by Ticker</label>
            <select className="input" style={{ width:140 }} value={ticker}
              onChange={e => { setTicker(e.target.value); fetchNews(e.target.value, limit) }}>
              {TICKERS.map(t => <option key={t} value={t}>{t || 'All tickers'}</option>)}
            </select>
          </div>
          <div>
            <label className="label mb-1 block">Sentiment</label>
            <select className="input" style={{ width:140 }} value={sentiment}
              onChange={e => setSentiment(e.target.value as any)}>
              <option value="all">All sentiment</option>
              <option value="positive">📈 Bullish</option>
              <option value="negative">📉 Bearish</option>
              <option value="neutral">⚖️ Neutral</option>
            </select>
          </div>
          <div>
            <label className="label mb-1 block">Topic</label>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {TOPICS.map(t => (
                <button key={t}
                  onClick={() => setTopic(t)}
                  style={{
                    fontSize:11, padding:'4px 10px', borderRadius:20, fontWeight:600, cursor:'pointer',
                    border: topic===t ? '1.5px solid #1B4FFF' : '1px solid #E8EDF5',
                    background: topic===t ? '#EEF2FF' : '#F9FAFB',
                    color: topic===t ? '#1B4FFF' : '#7D8FA9',
                  }}
                >{t}</button>
              ))}
            </div>
          </div>
          <button onClick={() => fetchNews(ticker, limit)} className="btn btn-ghost btn-sm" style={{ marginLeft:'auto' }}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Count */}
      <div style={{ fontSize:13, color:'#7D8FA9', marginBottom:12 }}>
        Showing {filtered.length} of {articles.length} articles
      </div>

      {/* Articles */}
      {loading ? (
        <div className="card p-10 text-center" style={{ color:'#7D8FA9' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📰</div>
          <div style={{ fontWeight:600 }}>Loading live news...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center" style={{ color:'#7D8FA9' }}>No articles match your filters.</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))', gap:16 }}>
          {filtered.map((a, i) => {
            const isExpanded = expanded === i
            const sentColor  = sentimentColor(a.sentiment)
            const sentLabel  = sentimentLabel(a.sentiment)
            const href       = a.url || a.link
            return (
              <div key={i} className="card p-4 hover-lift" style={{ cursor:'pointer', borderLeft:`3px solid ${sentColor}` }}
                onClick={() => setExpanded(isExpanded ? null : i)}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:8 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#0A1628', lineHeight:1.4, flex:1 }}>
                    {a.title}
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4, background:`${sentColor}15`, color:sentColor, whiteSpace:'nowrap', flexShrink:0 }}>
                    {sentLabel}
                  </span>
                </div>

                <div style={{ fontSize:11, color:'#9CA3AF', display:'flex', gap:8, marginBottom:8 }}>
                  <span style={{ fontWeight:600, color:'#7D8FA9' }}>{a.source}</span>
                  <span>·</span>
                  <span>{timeAgo(a.date)}</span>
                  {a.symbols?.length && <>
                    <span>·</span>
                    <span style={{ color:'#1B4FFF', fontWeight:600 }}>{a.symbols.slice(0,3).join(', ')}</span>
                  </>}
                </div>

                {isExpanded && a.content && (
                  <div style={{ fontSize:12, color:'#3D4F6E', lineHeight:1.6, marginBottom:10, borderTop:'1px solid #F1F5F9', paddingTop:10 }}>
                    {a.content.slice(0, 400)}{a.content.length > 400 ? '...' : ''}
                  </div>
                )}

                {href && (
                  <a href={href} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize:12, color:'#1B4FFF', fontWeight:600 }}>
                    Read full article ↗
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Load more */}
      {!loading && articles.length >= limit && (
        <div style={{ textAlign:'center', marginTop:24 }}>
          <button className="btn btn-ghost" onClick={() => { const n = limit+20; setLimit(n); fetchNews(ticker, n) }}>
            Load more articles
          </button>
        </div>
      )}
    </div>
  )
}

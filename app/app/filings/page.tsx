'use client'
import { useState, useEffect } from 'react'

interface Filing {
  form:           string
  date:           string
  accessionNumber: string
  docUrl?:        string
  description?:   string
  size?:          string
}

const FORM_COLORS: Record<string, { bg: string; color: string }> = {
  '10-K':    { bg:'rgba(27,79,255,0.1)',   color:'#1B4FFF'  },
  '10-Q':    { bg:'rgba(13,159,232,0.1)',  color:'#0D9FE8'  },
  '8-K':     { bg:'rgba(217,119,6,0.1)',   color:'#D97706'  },
  'DEF 14A': { bg:'rgba(124,58,237,0.1)',  color:'#7C3AED'  },
  '4':       { bg:'rgba(5,150,105,0.1)',   color:'#059669'  },
  'S-1':     { bg:'rgba(220,38,38,0.1)',   color:'#DC2626'  },
  'SC 13G':  { bg:'rgba(107,114,128,0.1)', color:'#6B7280'  },
  'SC 13D':  { bg:'rgba(107,114,128,0.1)', color:'#6B7280'  },
}

const FORM_DESCRIPTIONS: Record<string, string> = {
  '10-K':    'Annual Report — full year financial statements and business overview',
  '10-Q':    'Quarterly Report — financial statements for the quarter',
  '8-K':     'Current Report — material events and press releases',
  'DEF 14A': 'Proxy Statement — shareholder meeting and executive compensation',
  '4':       'Insider Transaction — form 4 insider buy/sell activity',
  'S-1':     'IPO Registration — initial public offering filing',
  'SC 13G':  'Beneficial Ownership — 5%+ passive shareholder report',
  'SC 13D':  'Beneficial Ownership — 5%+ active shareholder report',
}

const FORM_FILTERS = ['All','10-K','10-Q','8-K','DEF 14A','4','S-1']

const POPULAR = ['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','JPM','BRK.B','XOM']

export default function FilingsPage() {
  const [symbol, setSymbol]       = useState('')
  const [inputVal, setInputVal]   = useState('')
  const [filings, setFilings]     = useState<Filing[]>([])
  const [company, setCompany]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [formFilter, setFormFilter] = useState('All')
  const [sortDir, setSortDir]     = useState<-1|1>(-1)
  const [error, setError]         = useState('')

  async function fetchFilings(sym: string) {
    if (!sym) return
    setLoading(true)
    setError('')
    setFilings([])
    try {
      const res  = await fetch(`/api/filings?symbol=${sym.toUpperCase()}`)
      const data = await res.json()
      if (data.error) { setError(data.error); setLoading(false); return }
      setFilings(data.filings || [])
      setCompany(data.company || sym.toUpperCase())
      setSymbol(sym.toUpperCase())
    } catch (e) { setError('Failed to fetch filings') }
    setLoading(false)
  }

  function handleSearch() {
    if (!inputVal.trim()) return
    fetchFilings(inputVal.trim())
  }

  const filtered = filings
    .filter(f => formFilter === 'All' || f.form.startsWith(formFilter))
    .sort((a, b) => sortDir === -1 ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))

  const formStats = FORM_FILTERS.slice(1).reduce((acc, form) => {
    acc[form] = filings.filter(f => f.form.startsWith(form)).length
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title">SEC Filings</h1>
          <p style={{ fontSize:13, marginTop:2, color:'#7D8FA9' }}>Direct EDGAR access · 10-K · 10-Q · 8-K · insider trades · proxy</p>
        </div>
        {company && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', borderRadius:20, background:'rgba(27,79,255,0.08)', border:'1px solid rgba(27,79,255,0.15)' }}>
            <span style={{ fontSize:12, fontWeight:700, color:'#1B4FFF' }}>{symbol}</span>
            <span style={{ fontSize:12, color:'#7D8FA9' }}>{company}</span>
          </div>
        )}
      </div>

      {/* Search bar */}
      <div className="card" style={{ padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <input value={inputVal} onChange={e => setInputVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Enter ticker (e.g. AAPL)"
            style={{ width:200, padding:'10px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:14, fontFamily:'inherit', outline:'none', textTransform:'uppercase', fontWeight:700 }} />
          <button onClick={handleSearch} disabled={loading || !inputVal.trim()}
            style={{ padding:'10px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', opacity: loading||!inputVal.trim()?0.7:1 }}>
            {loading ? 'Loading…' : 'Fetch Filings'}
          </button>
          {/* Popular tickers */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {POPULAR.map(t => (
              <button key={t} onClick={() => { setInputVal(t); fetchFilings(t) }}
                style={{ padding:'6px 10px', borderRadius:20, border:'1px solid #E2E8F2', background: symbol===t?'#1B4FFF':'#F8FAFD', color:symbol===t?'#fff':'#4A5568', fontSize:11, fontWeight:700, cursor:'pointer', transition:'all 0.1s' }}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {error && <div style={{ marginTop:10, fontSize:13, color:'#DC2626', fontWeight:600 }}>⚠ {error}</div>}
      </div>

      {/* Form type stats */}
      {filings.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))', gap:10, marginBottom:20 }}>
          <div className="metric-card" style={{ cursor:'pointer', border: formFilter==='All'?'2px solid #1B4FFF':'1px solid #E2E8F2' }} onClick={() => setFormFilter('All')}>
            <div style={{ fontSize:10, fontWeight:700, color:'#7D8FA9', textTransform:'uppercase', marginBottom:4 }}>All Types</div>
            <div style={{ fontWeight:900, fontSize:'1.5rem', color:'#0A1628', letterSpacing:'-0.02em' }}>{filings.length}</div>
          </div>
          {FORM_FILTERS.slice(1).filter(f => formStats[f] > 0).map(form => {
            const fc = FORM_COLORS[form] || { bg:'#F0F4FA', color:'#7D8FA9' }
            return (
              <div key={form} className="metric-card" style={{ cursor:'pointer', border: formFilter===form?`2px solid ${fc.color}`:'1px solid #E2E8F2' }} onClick={() => setFormFilter(form)}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', marginBottom:4, color: fc.color }}>{form}</div>
                <div style={{ fontWeight:900, fontSize:'1.5rem', color:'#0A1628', letterSpacing:'-0.02em' }}>{formStats[form]}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Filings table */}
      {loading ? (
        <div className="card" style={{ overflow:'hidden' }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ padding:'14px 20px', borderBottom:'1px solid #F0F4FA', display:'flex', gap:16, alignItems:'center' }}>
              <div style={{ height:24, width:60, borderRadius:12, background:'#F0F4FA' }} />
              <div style={{ height:14, flex:1, borderRadius:4, background:'#F0F4FA' }} />
              <div style={{ height:14, width:80, borderRadius:4, background:'#F0F4FA' }} />
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="card" style={{ overflow:'hidden' }}>
          {/* Sort bar */}
          <div style={{ padding:'10px 20px', borderBottom:'1px solid #E2E8F2', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:13, fontWeight:600, color:'#7D8FA9' }}>{filtered.length} filings</span>
            <button onClick={() => setSortDir(d => d === -1 ? 1 : -1)}
              style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #E2E8F2', background:'#F8FAFD', color:'#4A5568', fontSize:11, fontWeight:600, cursor:'pointer' }}>
              Date {sortDir === -1 ? '↓ Newest' : '↑ Oldest'}
            </button>
          </div>
          <div>
            {filtered.map((f, i) => {
              const fc = FORM_COLORS[f.form] || { bg:'#F0F4FA', color:'#7D8FA9' }
              const desc = FORM_DESCRIPTIONS[f.form] || f.description || ''
              return (
                <div key={i} style={{ padding:'14px 20px', borderBottom: i < filtered.length-1 ? '1px solid #F0F4FA' : 'none', display:'flex', alignItems:'center', gap:14, transition:'background 0.1s' }}>
                  {/* Form badge */}
                  <span style={{ fontSize:11, fontWeight:800, padding:'4px 10px', borderRadius:8, background:fc.bg, color:fc.color, flexShrink:0, minWidth:64, textAlign:'center' }}>
                    {f.form}
                  </span>

                  {/* Info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:13, color:'#0A1628', marginBottom:2 }}>
                      {symbol} — {f.form}
                      {desc && <span style={{ fontWeight:400, color:'#7D8FA9', marginLeft:8, fontSize:12 }}>{desc}</span>}
                    </div>
                    <div style={{ fontSize:11, color:'#B0BCD0', fontFamily:'monospace' }}>{f.accessionNumber}</div>
                  </div>

                  {/* Date */}
                  <div style={{ fontSize:13, fontWeight:600, color:'#4A5568', flexShrink:0 }}>{f.date}</div>

                  {/* Link */}
                  {f.docUrl && (
                    <a href={f.docUrl} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #E2E8F2', background:'#fff', color:'#1B4FFF', fontSize:12, fontWeight:700, cursor:'pointer', textDecoration:'none', flexShrink:0, transition:'all 0.1s' }}>
                      View on SEC →
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : !loading && symbol ? (
        <div className="card" style={{ padding:48, textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>▣</div>
          <div style={{ fontWeight:700, fontSize:15, color:'#0A1628', marginBottom:6 }}>No filings found for {symbol}</div>
          <div style={{ fontSize:13, color:'#7D8FA9' }}>Try a different ticker or form type filter</div>
        </div>
      ) : !loading && (
        <div className="card" style={{ padding:64, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:16 }}>▣</div>
          <div style={{ fontWeight:800, fontSize:16, color:'#0A1628', marginBottom:8 }}>Search SEC Filings</div>
          <div style={{ fontSize:13, color:'#7D8FA9', maxWidth:380, margin:'0 auto', lineHeight:1.6 }}>
            Enter a ticker above to retrieve all SEC filings from EDGAR — 10-Ks, 10-Qs, 8-Ks, insider transactions, proxy statements and more.
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

type Filing = {
  date: string
  type: string
  title: string
  link: string
  symbol?: string
  companyName?: string
}

const FORM_TYPES = ['', '10-K', '10-Q', '8-K', 'S-1', 'DEF 14A', '4', '13F', 'SC 13G', 'SC 13D']
const FORM_DESC: Record<string, string> = {
  '10-K':    'Annual report',
  '10-Q':    'Quarterly report',
  '8-K':     'Current report / material event',
  'S-1':     'IPO / securities registration',
  'DEF 14A': 'Proxy statement / shareholder vote',
  '4':       'Insider transaction',
  '13F':     'Institutional holdings (quarterly)',
  'SC 13G':  'Passive stake >5%',
  'SC 13D':  'Active stake >5%',
}

const BADGE_COLOR: Record<string, string> = {
  '10-K':'badge-blue', '10-Q':'badge-blue', '8-K':'badge-amber',
  'S-1':'badge-green', 'DEF 14A':'badge-gray', '4':'badge-purple',
  '13F':'badge-gray', 'SC 13G':'badge-gray', 'SC 13D':'badge-red',
}

export default function FilingsPage() {
  const [symbol, setSymbol]   = useState('AAPL')
  const [input,  setInput]    = useState('AAPL')
  const [type,   setType]     = useState('')
  const [filings, setFilings] = useState<Filing[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [searched, setSearched] = useState(false)

  // SEC full-text search
  const [secQuery,  setSecQuery]  = useState('')
  const [secResults, setSecResults] = useState<any[]>([])
  const [secLoading, setSecLoading] = useState(false)
  const [tab, setTab] = useState<'company'|'search'>('company')

  async function fetchFilings(sym = symbol, t = type) {
    setLoading(true); setError(''); setSearched(true)
    try {
      const params = new URLSearchParams({ symbol: sym, limit: '20' })
      if (t) params.set('type', t)
      const res = await fetch(`/api/sec/filings?${params}`)
      const d   = await res.json()
      setFilings(d.filings || d || [])
    } catch (e: any) {
      setError('Failed to load filings. Check the ticker.')
    }
    setLoading(false)
  }

  async function searchSEC() {
    if (!secQuery.trim()) return
    setSecLoading(true)
    try {
      const res  = await fetch(`/api/sec/search?q=${encodeURIComponent(secQuery)}&limit=15`)
      const d    = await res.json()
      setSecResults(d.hits || d.results || [])
    } catch {}
    setSecLoading(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { setSymbol(input); fetchFilings(input, type) }
  }

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="page-title">SEC Filings</h1>
          <p style={{ color:'#7D8FA9', fontSize:13 }}>10-K, 10-Q, 8-K, S-1, insider transactions & more · EDGAR live data</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar mb-5">
        {[['company','By Company'],['search','Full-Text Search']].map(([v,l]) => (
          <button key={v} className={`tab-btn ${tab===v?'active':''}`} onClick={() => setTab(v as any)}>{l}</button>
        ))}
      </div>

      {tab === 'company' && (
        <>
          {/* Search bar */}
          <div className="card p-4 mb-5">
            <div className="flex gap-3 flex-wrap items-end">
              <div>
                <label className="label mb-1 block">Ticker *</label>
                <input className="input" style={{ width:120, textTransform:'uppercase' }}
                  placeholder="e.g. AAPL" value={input}
                  onChange={e => setInput(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown} />
              </div>
              <div>
                <label className="label mb-1 block">Filing Type</label>
                <select className="input" style={{ width:160 }} value={type}
                  onChange={e => setType(e.target.value)}>
                  {FORM_TYPES.map(t => (
                    <option key={t} value={t}>{t || 'All types'}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => { setSymbol(input); fetchFilings(input, type) }}
                disabled={!input}
                className="btn btn-primary"
              >
                Search Filings
              </button>
            </div>

            {/* Form type legend */}
            <div style={{ marginTop:16, display:'flex', flexWrap:'wrap', gap:6 }}>
              {Object.entries(FORM_DESC).map(([k,v]) => (
                <button
                  key={k}
                  onClick={() => { setType(k); setSymbol(input); fetchFilings(input, k) }}
                  style={{
                    fontSize:11, padding:'3px 8px', borderRadius:6, fontWeight:600, cursor:'pointer',
                    border: type===k ? '1.5px solid #1B4FFF' : '1px solid #E8EDF5',
                    background: type===k ? '#EEF2FF' : '#F9FAFB',
                    color: type===k ? '#1B4FFF' : '#7D8FA9',
                  }}
                  title={v}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {/* Results */}
          {loading && (
            <div className="card p-8 text-center" style={{ color:'#7D8FA9' }}>
              <div style={{ fontSize:28, marginBottom:8 }}>⏳</div>
              <div>Loading filings for {symbol}...</div>
            </div>
          )}

          {!loading && error && (
            <div className="card p-6 text-center" style={{ color:'#EF4444' }}>{error}</div>
          )}

          {!loading && searched && !error && filings.length === 0 && (
            <div className="card p-8 text-center" style={{ color:'#7D8FA9' }}>
              No filings found for <strong>{symbol}</strong>{type ? ` (${type})` : ''}
            </div>
          )}

          {!loading && filings.length > 0 && (
            <div className="card overflow-hidden">
              <div style={{ padding:'12px 16px', borderBottom:'1px solid #E8EDF5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontWeight:700, color:'#0A1628' }}>{symbol} — {filings.length} filings</span>
                <span style={{ fontSize:12, color:'#7D8FA9' }}>Source: SEC EDGAR</span>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filings.map((f, i) => (
                    <tr key={i}>
                      <td style={{ fontSize:12, color:'#7D8FA9', whiteSpace:'nowrap' }}>
                        {f.date?.slice(0,10)}
                      </td>
                      <td>
                        <span className={`badge ${BADGE_COLOR[f.type] || 'badge-gray'}`}>{f.type}</span>
                      </td>
                      <td style={{ fontSize:13, color:'#3D4F6E' }}>
                        <div>{f.title || FORM_DESC[f.type] || '—'}</div>
                        {FORM_DESC[f.type] && <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>{FORM_DESC[f.type]}</div>}
                      </td>
                      <td>
                        {f.link && (
                          <a href={f.link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                            View ↗
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'search' && (
        <>
          <div className="card p-4 mb-5">
            <div className="section-title mb-3">Full-Text SEC EDGAR Search</div>
            <div className="flex gap-3">
              <input
                className="input flex-1"
                placeholder='e.g. "artificial intelligence risk factors" or "share repurchase program"'
                value={secQuery}
                onChange={e => setSecQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchSEC()}
              />
              <button onClick={searchSEC} disabled={!secQuery.trim()} className="btn btn-primary">
                Search EDGAR
              </button>
            </div>
            <div style={{ marginTop:10, fontSize:12, color:'#7D8FA9' }}>
              Search across millions of SEC filings by keyword, phrase, or company name
            </div>
          </div>

          {secLoading && (
            <div className="card p-8 text-center" style={{ color:'#7D8FA9' }}>⏳ Searching EDGAR...</div>
          )}

          {!secLoading && secResults.length > 0 && (
            <div className="card overflow-hidden">
              <table className="data-table">
                <thead>
                  <tr><th>Company</th><th>Type</th><th>Filed</th><th>Excerpt</th><th></th></tr>
                </thead>
                <tbody>
                  {secResults.map((r: any, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight:600, fontSize:13 }}>{r.entity_name || r.company || '—'}</td>
                      <td><span className={`badge ${BADGE_COLOR[r.file_type || r.type] || 'badge-gray'}`}>{r.file_type || r.type || '—'}</span></td>
                      <td style={{ fontSize:12, color:'#7D8FA9' }}>{r.file_date?.slice(0,10) || r.date?.slice(0,10)}</td>
                      <td style={{ fontSize:12, color:'#3D4F6E', maxWidth:300 }}>
                        <div className="line-clamp-2" dangerouslySetInnerHTML={{ __html: r.description || r.excerpt || '' }} />
                      </td>
                      <td>
                        {(r.file_url || r.link) && (
                          <a href={r.file_url || r.link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">View ↗</a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!secLoading && secQuery && secResults.length === 0 && (
            <div className="card p-8 text-center" style={{ color:'#7D8FA9' }}>
              No results for "{secQuery}". Try a different query.
            </div>
          )}
        </>
      )}
    </div>
  )
}

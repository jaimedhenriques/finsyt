'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { fmtLarge, fmtPct, fmt, changeClass } from '@/lib/utils'

interface QuoteData {
  symbol:       string
  name:         string
  price:        number
  change:       number
  changePct:    number
  marketCap:    number
  pe:           number
  volume:       number
  high52:       number
  low52:        number
  spark?:       number[]
  lastUpdated?: string
}

const DEFAULT_WATCHLIST = ['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','NFLX']

export default function WatchlistPage() {
  const [watchlist, setWatchlist]   = useState<string[]>([])
  const [quotes, setQuotes]         = useState<Record<string, QuoteData>>({})
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [newSymbol, setNewSymbol]   = useState('')
  const [adding, setAdding]         = useState(false)
  const [addError, setAddError]     = useState('')
  const [sortKey, setSortKey]       = useState<keyof QuoteData>('marketCap')
  const [sortDir, setSortDir]       = useState<1|-1>(-1)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Load watchlist from /api/watchlist (falls back to defaults)
  useEffect(() => {
    fetch('/api/watchlist')
      .then(r => r.json())
      .then(d => setWatchlist(d.watchlist?.length ? d.watchlist : DEFAULT_WATCHLIST))
      .catch(() => setWatchlist(DEFAULT_WATCHLIST))
  }, [])

  const fetchQuotes = useCallback(async (symbols: string[]) => {
    if (!symbols.length) { setLoading(false); return }
    const results: Record<string, QuoteData> = {}
    await Promise.allSettled(
      symbols.map(sym =>
        fetch(`/api/quote?symbol=${sym}`)
          .then(r => r.json())
          .then(d => {
            if (d.price) results[sym] = {
              symbol:    sym,
              name:      d.name || d.companyName || sym,
              price:     d.price || 0,
              change:    d.change || 0,
              changePct: d.changePct || d.changesPercentage || 0,
              marketCap: d.marketCap || 0,
              pe:        d.pe || 0,
              volume:    d.volume || 0,
              high52:    d.yearHigh || d.high52 || 0,
              low52:     d.yearLow  || d.low52  || 0,
              spark:     d.spark    || [],
            }
          })
      )
    )
    setQuotes(prev => ({ ...prev, ...results }))
    setLastUpdated(new Date())
  }, [])

  useEffect(() => {
    if (!watchlist.length) return
    setLoading(true)
    fetchQuotes(watchlist).finally(() => setLoading(false))
  }, [watchlist.join(',')]) // eslint-disable-line

  // Auto-refresh every 60s
  useEffect(() => {
    if (!watchlist.length) return
    const id = setInterval(() => { setRefreshing(true); fetchQuotes(watchlist).finally(() => setRefreshing(false)) }, 60_000)
    return () => clearInterval(id)
  }, [watchlist, fetchQuotes])

  async function addSymbol() {
    if (!newSymbol.trim()) return
    const sym = newSymbol.trim().toUpperCase()
    setAdding(true)
    setAddError('')
    try {
      // Validate it exists
      const res  = await fetch(`/api/quote?symbol=${sym}`)
      const data = await res.json()
      if (!data.price) { setAddError(`Symbol "${sym}" not found`); setAdding(false); return }
      // Add to API
      const wRes  = await fetch('/api/watchlist', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ symbol:sym, action:'add' }) })
      const wData = await wRes.json()
      const newList = wData.watchlist || [...watchlist, sym]
      setWatchlist(newList)
      setQuotes(prev => ({ ...prev, [sym]: { symbol:sym, name:data.name||sym, price:data.price, change:data.change||0, changePct:data.changePct||0, marketCap:data.marketCap||0, pe:data.pe||0, volume:data.volume||0, high52:data.yearHigh||0, low52:data.yearLow||0 } }))
      setNewSymbol('')
    } catch { setAddError('Failed to add symbol') }
    setAdding(false)
  }

  async function removeSymbol(sym: string) {
    try {
      await fetch('/api/watchlist', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ symbol:sym, action:'remove' }) })
    } catch {}
    setWatchlist(prev => prev.filter(s => s !== sym))
    setQuotes(prev => { const n = { ...prev }; delete n[sym]; return n })
  }

  function toggleSort(key: keyof QuoteData) {
    setSortKey(key)
    setSortDir(prev => sortKey === key ? (prev === -1 ? 1 : -1) : -1)
  }

  const rows = watchlist
    .map(sym => quotes[sym])
    .filter(Boolean)
    .sort((a, b) => {
      const av = a[sortKey] as number ?? 0
      const bv = b[sortKey] as number ?? 0
      return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir
    })

  const SortIcon = ({ k }: { k: keyof QuoteData }) => (
    <span style={{ color: sortKey===k?'#1B4FFF':'#D0D8E8', marginLeft:4 }}>
      {sortKey===k ? (sortDir===-1?'↓':'↑') : '↕'}
    </span>
  )

  // Portfolio stats
  const totalMcap    = Object.values(quotes).reduce((s, q) => s + (q.marketCap || 0), 0)
  const avgChange    = rows.length ? rows.reduce((s, q) => s + (q.changePct || 0), 0) / rows.length : 0
  const gainers      = rows.filter(q => q.changePct > 0).length
  const losers       = rows.filter(q => q.changePct < 0).length

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title">Watchlist</h1>
          <p style={{ fontSize:13, marginTop:2, color:'#7D8FA9' }}>{watchlist.length} symbols tracked · live quotes</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {lastUpdated && (
            <span style={{ fontSize:11, color:'#B0BCD0' }}>
              {refreshing ? 'Refreshing…' : `Updated ${lastUpdated.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`}
            </span>
          )}
          <button onClick={() => { setRefreshing(true); fetchQuotes(watchlist).finally(() => setRefreshing(false)) }}
            style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600, color:'#4A5568' }}>
            ↻
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'Symbols',      value: watchlist.length,                 color:'#1B4FFF' },
          { label:'Portfolio MCap',value: fmtLarge(totalMcap),             color:'#0A1628' },
          { label:'Avg Change',    value: `${avgChange>0?'+':''}${avgChange.toFixed(2)}%`, color: avgChange>=0?'#059669':'#DC2626' },
          { label:'Gainers / Losers', value: `${gainers} / ${losers}`,    color:'#7D8FA9' },
        ].map(card => (
          <div key={card.label} className="metric-card">
            <div style={{ fontSize:11, fontWeight:600, color:'#7D8FA9', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6 }}>{card.label}</div>
            <div style={{ fontWeight:900, fontSize:'1.4rem', color:card.color, letterSpacing:'-0.02em' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Add symbol bar */}
      <div style={{ display:'flex', gap:8, marginBottom:20, alignItems:'center', flexWrap:'wrap' }}>
        <input value={newSymbol} onChange={e => setNewSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && addSymbol()}
          placeholder="Add ticker (e.g. AAPL, MSFT)"
          style={{ width:220, padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none', textTransform:'uppercase' }} />
        <button onClick={addSymbol} disabled={adding || !newSymbol.trim()}
          style={{ padding:'9px 16px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', opacity: adding||!newSymbol.trim()?0.6:1 }}>
          {adding ? '…' : '+ Add'}
        </button>
        {addError && <span style={{ fontSize:12, color:'#DC2626', fontWeight:600 }}>{addError}</span>}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow:'hidden' }}>
        {watchlist.length === 0 ? (
          <div style={{ padding:48, textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>◈</div>
            <div style={{ fontWeight:700, fontSize:15, color:'#0A1628', marginBottom:6 }}>Your watchlist is empty</div>
            <div style={{ fontSize:13, color:'#7D8FA9' }}>Add tickers above to start tracking</div>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Company</th>
                  <th className="right" style={{ cursor:'pointer' }} onClick={() => toggleSort('price')}>Price <SortIcon k="price" /></th>
                  <th className="right" style={{ cursor:'pointer' }} onClick={() => toggleSort('changePct')}>Change <SortIcon k="changePct" /></th>
                  <th className="right" style={{ cursor:'pointer' }} onClick={() => toggleSort('marketCap')}>Mkt Cap <SortIcon k="marketCap" /></th>
                  <th className="right" style={{ cursor:'pointer' }} onClick={() => toggleSort('pe')}>P/E <SortIcon k="pe" /></th>
                  <th className="right" style={{ cursor:'pointer' }} onClick={() => toggleSort('volume')}>Volume <SortIcon k="volume" /></th>
                  <th>52W Range</th>
                  <th>Trend</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(watchlist.length || 5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(10)].map((_,j) => <td key={j}><div style={{height:14,borderRadius:4,background:'#F0F4FA',width:'80%'}} /></td>)}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  // Symbols added but quotes not yet loaded
                  watchlist.map(sym => (
                    <tr key={sym}>
                      <td><span style={{fontWeight:700,fontSize:13,color:'#1B4FFF'}}>{sym}</span></td>
                      <td colSpan={9} style={{color:'#B0BCD0',fontSize:12}}>Loading quote…</td>
                    </tr>
                  ))
                ) : rows.map((q) => {
                  const range52pct = q.high52 > q.low52 ? ((q.price - q.low52) / (q.high52 - q.low52)) * 100 : 50
                  return (
                    <tr key={q.symbol} style={{ cursor:'pointer' }} onClick={() => window.location.href = `/app/company/${q.symbol}`}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:30,height:30,borderRadius:8,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontWeight:900,flexShrink:0 }}>{q.symbol.slice(0,2)}</div>
                          <span style={{ fontWeight:800, fontSize:13, color:'#1B4FFF' }}>{q.symbol}</span>
                        </div>
                      </td>
                      <td style={{ fontSize:12, color:'#4A5568', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{q.name}</td>
                      <td className="right" style={{ fontWeight:800, fontSize:14, color:'#0A1628' }}>${q.price.toFixed(2)}</td>
                      <td className={`right ${changeClass(q.changePct)}`} style={{ fontSize:13, fontWeight:700 }}>
                        {q.changePct > 0 ? '+' : ''}{q.changePct.toFixed(2)}%
                        {q.change !== 0 && <div style={{ fontSize:10, opacity:0.7 }}>{q.change > 0 ? '+' : ''}{q.change.toFixed(2)}</div>}
                      </td>
                      <td className="right" style={{ fontSize:13, color:'#3D4F6E' }}>{fmtLarge(q.marketCap)}</td>
                      <td className="right" style={{ fontSize:13, color:'#3D4F6E' }}>{q.pe > 0 ? `${q.pe.toFixed(1)}x` : '—'}</td>
                      <td className="right" style={{ fontSize:12, color:'#7D8FA9' }}>{fmtLarge(q.volume)}</td>
                      <td style={{ minWidth:120 }}>
                        {q.high52 > 0 && (
                          <div>
                            <div style={{ height:4, borderRadius:2, background:'#F0F4FA', overflow:'hidden', marginBottom:3 }}>
                              <div style={{ height:'100%', width:`${Math.min(range52pct,100)}%`, borderRadius:2, background: range52pct > 70 ? '#059669' : range52pct < 30 ? '#DC2626' : '#1B4FFF' }} />
                            </div>
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'#B0BCD0' }}>
                              <span>${q.low52.toFixed(0)}</span><span>${q.high52.toFixed(0)}</span>
                            </div>
                          </div>
                        )}
                      </td>
                      <td>
                        {q.spark && q.spark.length > 0 && (
                          <ResponsiveContainer width={64} height={28}>
                            <AreaChart data={q.spark.map((v,i)=>({v,i}))} margin={{top:2,right:0,bottom:2,left:0}}>
                              <defs>
                                <linearGradient id={`sg_${q.symbol}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%"  stopColor={q.changePct>=0?'#059669':'#DC2626'} stopOpacity={0.3} />
                                  <stop offset="95%" stopColor={q.changePct>=0?'#059669':'#DC2626'} stopOpacity={0}   />
                                </linearGradient>
                              </defs>
                              <Area type="monotone" dataKey="v" stroke={q.changePct>=0?'#059669':'#DC2626'} strokeWidth={1.5} fill={`url(#sg_${q.symbol})`} dot={false} />
                            </AreaChart>
                          </ResponsiveContainer>
                        )}
                      </td>
                      <td onClick={e => { e.stopPropagation(); removeSymbol(q.symbol) }}
                        style={{ color:'#D0D8E8', cursor:'pointer', fontSize:16, padding:'0 8px', textAlign:'center' }}
                        title="Remove from watchlist">×</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

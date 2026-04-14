'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { fmtLarge, fmtPct, fmt } from '@/lib/utils'

interface QuoteData {
  symbol: string
  name: string
  price: number
  change: number
  changePct: number
  marketCap: number
  pe: number
  volume: number
  high52: number
  low52: number
  spark?: number[]
  lastUpdated?: string
}

const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'NFLX']

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [newSymbol, setNewSymbol] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [sortKey, setSortKey] = useState<keyof QuoteData>('marketCap')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)
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
              symbol: sym,
              name: d.name || d.companyName || sym,
              price: d.price || 0,
              change: d.change || 0,
              changePct: d.changePct || d.changesPercentage || 0,
              marketCap: d.marketCap || 0,
              pe: d.pe || 0,
              volume: d.volume || 0,
              high52: d.yearHigh || d.high52 || 0,
              low52: d.yearLow || d.low52 || 0,
              spark: d.spark || [],
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

  // Auto-refresh every 30s (live data)
  useEffect(() => {
    if (!watchlist.length) return
    const id = setInterval(() => {
      setRefreshing(true)
      fetchQuotes(watchlist).finally(() => setRefreshing(false))
    }, 30_000)
    return () => clearInterval(id)
  }, [watchlist, fetchQuotes])

  async function addSymbol() {
    if (!newSymbol.trim()) return
    const sym = newSymbol.trim().toUpperCase()
    setAdding(true)
    setAddError('')
    try {
      const res = await fetch(`/api/quote?symbol=${sym}`)
      const data = await res.json()
      if (!data.price) { setAddError(`Symbol "${sym}" not found`); setAdding(false); return }
      const wRes = await fetch('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: sym, action: 'add' }) })
      const wData = await wRes.json()
      const newList = wData.watchlist || [...watchlist, sym]
      setWatchlist(newList)
      setQuotes(prev => ({ ...prev, [sym]: { symbol: sym, name: data.name || sym, price: data.price, change: data.change || 0, changePct: data.changePct || 0, marketCap: data.marketCap || 0, pe: data.pe || 0, volume: data.volume || 0, high52: data.yearHigh || 0, low52: data.yearLow || 0 } }))
      setNewSymbol('')
    } catch { setAddError('Failed to add symbol') }
    setAdding(false)
  }

  async function removeSymbol(sym: string) {
    try {
      await fetch('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: sym, action: 'remove' }) })
    } catch { }
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
    <span style={{ color: sortKey === k ? '#1B4FFF' : '#D0D8E8', marginLeft: 4, fontSize: 11 }}>
      {sortKey === k ? (sortDir === -1 ? '↓' : '↑') : '↕'}
    </span>
  )

  // Portfolio stats
  const totalMcap = Object.values(quotes).reduce((s, q) => s + (q.marketCap || 0), 0)
  const avgChange = rows.length ? rows.reduce((s, q) => s + (q.changePct || 0), 0) / rows.length : 0
  const gainers = rows.filter(q => q.changePct > 0).length
  const losers = rows.filter(q => q.changePct < 0).length

  function genSpark(base: number, n = 15) {
    const arr = [base]
    for (let i = 1; i < n; i++) arr.push(arr[i - 1] * (1 + (Math.random() - 0.48) * 0.01))
    return arr.map(v => ({ v }))
  }

  return (
    <div style={{ padding: '1.75rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 800, color: '#0A1628', letterSpacing: '-0.03em', margin: 0 }}>Watchlist</h1>
          <p style={{ fontSize: 13, marginTop: 4, color: '#9BAFC8' }}>{watchlist.length} symbols · live prices (auto-refresh 30s)</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: '#B0BCD0' }}>
              {refreshing ? '🔄 Refreshing…' : `✓ ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
            </span>
          )}
          <button onClick={() => { setRefreshing(true); fetchQuotes(watchlist).finally(() => setRefreshing(false)) }}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E2E8F2', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#4A5568', transition: 'all 0.14s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1B4FFF'; (e.currentTarget as HTMLElement).style.background = '#F5F8FF' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F2'; (e.currentTarget as HTMLElement).style.background = '#fff' }}>
            ↻ Refresh Now
          </button>
        </div>
      </div>

      {/* Portfolio stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Tracked', value: watchlist.length, color: '#1B4FFF' },
          { label: 'Portfolio MCap', value: fmtLarge(totalMcap), color: '#0A1628' },
          { label: 'Avg Change', value: `${avgChange > 0 ? '+' : ''}${avgChange.toFixed(2)}%`, color: avgChange >= 0 ? '#059669' : '#DC2626' },
          { label: 'Gainers/Losers', value: `${gainers}/${losers}`, color: '#7D8FA9' },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9BAFC8', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: card.color, letterSpacing: '-0.01em' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Add symbol section */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={newSymbol} onChange={e => setNewSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && addSymbol()}
            placeholder="Add ticker (e.g. AAPL, MSFT)"
            style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 8, border: '1.5px solid #E2E8F2', fontSize: 13, fontFamily: 'inherit', outline: 'none', textTransform: 'uppercase' }} />
          <button onClick={addSymbol} disabled={adding || !newSymbol.trim()}
            style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: adding || !newSymbol.trim() ? '#D0D8E8' : 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {adding ? '…' : '+ Add Symbol'}
          </button>
          {addError && <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>{addError}</span>}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ animation: 'pulse 2s infinite', color: '#B0BCD0' }}>Loading quotes…</div>
        </div>
      ) : watchlist.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>◈</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0A1628', marginBottom: 6 }}>Your watchlist is empty</div>
          <div style={{ fontSize: 13, color: '#9BAFC8' }}>Add tickers above to start tracking stocks</div>
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F2' }}>
                <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#7D8FA9', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Symbol</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#7D8FA9', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Company</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#7D8FA9', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', cursor: 'pointer' }} onClick={() => toggleSort('price')}>Price <SortIcon k="price" /></th>
                <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#7D8FA9', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', cursor: 'pointer' }} onClick={() => toggleSort('changePct')}>Change <SortIcon k="changePct" /></th>
                <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#7D8FA9', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', cursor: 'pointer' }} onClick={() => toggleSort('marketCap')}>Mkt Cap <SortIcon k="marketCap" /></th>
                <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#7D8FA9', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', cursor: 'pointer' }} onClick={() => toggleSort('pe')}>P/E <SortIcon k="pe" /></th>
                <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#7D8FA9', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', cursor: 'pointer' }} onClick={() => toggleSort('volume')}>Volume <SortIcon k="volume" /></th>
                <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#7D8FA9', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em' }}>52W Range</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#7D8FA9', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Trend</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q, i) => {
                const posChange = q.changePct >= 0
                const range52pct = q.high52 > 0 && q.low52 > 0 ? ((q.price - q.low52) / (q.high52 - q.low52)) * 100 : 50
                return (
                  <tr key={q.symbol} style={{ borderBottom: i < rows.length - 1 ? '1px solid #F0F4FA' : 'none' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0A1628' }}>
                      <Link href={`/app/company/${q.symbol}`} style={{ color: '#1B4FFF', textDecoration: 'none' }}>
                        {q.symbol}
                      </Link>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#5A6E7F', fontSize: 12 }}>
                      {q.name}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0A1628' }}>
                      ${fmt(q.price)}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: posChange ? '#059669' : '#DC2626' }}>
                      {posChange ? '+' : ''}{fmt(q.change)}
                      <br />
                      <span style={{ fontSize: 11, fontWeight: 700 }}>({posChange ? '+' : ''}{fmtPct(q.changePct)})</span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 12, color: '#7D8FA9' }}>
                      {fmtLarge(q.marketCap)}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0A1628' }}>
                      {q.pe > 0 ? `${fmt(q.pe)}x` : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 12, color: '#7D8FA9' }}>
                      {fmtLarge(q.volume)}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', minWidth: 100 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                        <div style={{ width: 60, height: 24, position: 'relative', background: '#F8FAFD', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', left: '0%', top: '0%', width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
                            <div style={{ width: `${range52pct}%`, height: 2, background: '#1B4FFF' }} />
                          </div>
                          <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontSize: 7, color: '#B0BCD0', fontWeight: 700 }}>◆</span>
                        </div>
                        <span style={{ fontSize: 11, color: '#9BAFC8', minWidth: 35, textAlign: 'right' }}>
                          {fmtPct((range52pct / 100).toFixed(0))}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', minWidth: 80 }}>
                      <ResponsiveContainer width={80} height={32}>
                        <AreaChart data={genSpark(q.price)} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                          <defs>
                            <linearGradient id={`sg${q.symbol}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={posChange ? '#059669' : '#DC2626'} stopOpacity={0.2} />
                              <stop offset="95%" stopColor={posChange ? '#059669' : '#DC2626'} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="v" stroke={posChange ? '#059669' : '#DC2626'} strokeWidth={1.5} fill={`url(#sg${q.symbol})`} dot={false} isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <button onClick={() => removeSymbol(q.symbol)}
                        style={{ background: 'none', border: 'none', color: '#D0D8E8', cursor: 'pointer', fontSize: 14, padding: 0 }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#DC2626'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#D0D8E8'}>
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import { fmtLarge, fmtPct, fmt, changeClass } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
interface IndexQuote { label: string; ticker: string; price: number; change: number; changePct: number; ytd?: number; spark?: number[] }
interface ForexRate  { pair: string; from: string; to: string; rate: number; change?: number; changePct?: number }
interface Mover      { symbol: string; name: string; price: number; changePct: number }
interface SectorData { name: string; change: number; mcap: string; top: string }

// ── Static fallbacks (shown while loading) ───────────────────────────────────
const INDEX_TICKERS = [
  { label: 'S&P 500',       ticker: 'SPY',  display: '.SPX' },
  { label: 'NASDAQ 100',    ticker: 'QQQ',  display: '.NDX' },
  { label: 'Dow Jones',     ticker: 'DIA',  display: '.DJI' },
  { label: 'FTSE 100',      ticker: 'ISF.L',display: '.FTSE' },
  { label: 'EURO STOXX 50', ticker: 'FEZ',  display: '.STOXX50E' },
  { label: 'Nikkei 225',    ticker: 'EWJ',  display: '.N225' },
  { label: 'Hang Seng',     ticker: '2800.HK',display:'.HSI' },
  { label: 'DAX',           ticker: 'EWG',  display: '.GDAXI' },
]
const FOREX_PAIRS = [
  { from:'EUR', to:'USD' },{ from:'GBP', to:'USD' },{ from:'USD', to:'JPY' },
  { from:'USD', to:'CHF' },{ from:'USD', to:'CAD' },{ from:'AUD', to:'USD' },
  { from:'NZD', to:'USD' },{ from:'EUR', to:'GBP' },
]
const SECTORS_STATIC: SectorData[] = [
  { name:'Technology',      change:1.42,  mcap:'$14.2T', top:'NVDA +2.8%' },
  { name:'Healthcare',      change:0.31,  mcap:'$6.8T',  top:'LLY +1.5%'  },
  { name:'Financials',      change:-0.12, mcap:'$7.1T',  top:'JPM +0.3%'  },
  { name:'Energy',          change:-0.82, mcap:'$3.4T',  top:'XOM -0.8%'  },
  { name:'Consumer Disc.',  change:0.64,  mcap:'$4.9T',  top:'AMZN +1.1%' },
  { name:'Consumer Staples',change:0.18,  mcap:'$3.1T',  top:'WMT +0.4%'  },
  { name:'Industrials',     change:0.22,  mcap:'$4.2T',  top:'HON +0.5%'  },
  { name:'Utilities',       change:-0.45, mcap:'$1.4T',  top:'NEE -0.3%'  },
  { name:'Real Estate',     change:-0.67, mcap:'$1.2T',  top:'AMT -0.7%'  },
  { name:'Materials',       change:0.35,  mcap:'$2.1T',  top:'LIN +0.4%'  },
  { name:'Communication',   change:0.91,  mcap:'$4.4T',  top:'META +0.9%' },
]

function SparkLine({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data?.length) return <div style={{ width: 64, height: 28 }} />
  return (
    <ResponsiveContainer width={64} height={28}>
      <AreaChart data={data.map((v, i) => ({ v, i }))} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <defs>
          <linearGradient id={`sg${positive ? 'g' : 'r'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={positive ? '#059669' : '#DC2626'} stopOpacity={0.3} />
            <stop offset="95%" stopColor={positive ? '#059669' : '#DC2626'} stopOpacity={0}   />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={positive ? '#059669' : '#DC2626'} strokeWidth={1.5}
          fill={`url(#sg${positive ? 'g' : 'r'})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default function MarketsPage() {
  const [tab, setTab] = useState<'overview' | 'forex' | 'movers' | 'sectors'>('overview')
  const [indices, setIndices]     = useState<IndexQuote[]>([])
  const [forex, setForex]         = useState<ForexRate[]>([])
  const [gainers, setGainers]     = useState<Mover[]>([])
  const [losers, setLosers]       = useState<Mover[]>([])
  const [active, setActive]       = useState<Mover[]>([])
  const [moversTab, setMoversTab] = useState<'gainers'|'losers'|'active'>('gainers')
  const [loading, setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadIndices = useCallback(async () => {
    try {
      const results = await Promise.allSettled(
        INDEX_TICKERS.map(({ ticker, label, display }) =>
          fetch(`/api/quote?symbol=${ticker}`)
            .then(r => r.json())
            .then(d => ({
              label,
              ticker: display,
              price: d.price || 0,
              change: d.change || 0,
              changePct: d.changePct || d.changesPercentage || 0,
              spark: d.spark || [],
            } as IndexQuote))
        )
      )
      const ok = results.filter(r => r.status === 'fulfilled').map(r => (r as any).value)
      if (ok.length > 0) setIndices(ok)
    } catch {}
  }, [])

  const loadForex = useCallback(async () => {
    try {
      const results = await Promise.allSettled(
        FOREX_PAIRS.map(({ from, to }) =>
          fetch(`/api/forex?from=${from}&to=${to}`)
            .then(r => r.json())
            .then(d => ({ pair: `${from}/${to}`, from, to, rate: d.rate || 0, changePct: d.changePct || 0 } as ForexRate))
        )
      )
      const ok = results.filter(r => r.status === 'fulfilled').map(r => (r as any).value).filter(r => r.rate > 0)
      if (ok.length > 0) setForex(ok)
    } catch {}
  }, [])

  const loadMovers = useCallback(async () => {
    try {
      const [gRes, lRes, aRes] = await Promise.allSettled([
        fetch('/api/market-trends?type=GAINERS').then(r => r.json()),
        fetch('/api/market-trends?type=LOSERS').then(r => r.json()),
        fetch('/api/market-trends?type=MOST_ACTIVE').then(r => r.json()),
      ])
      const norm = (arr: any[]): Mover[] => (arr || []).slice(0, 10).map(m => ({
        symbol: m.ticker || m.symbol || '',
        name:   m.name   || m.companyName || '',
        price:  m.price  || m.last || 0,
        changePct: m.todaysChangePerc || m.changes || m.changesPercentage || 0,
      }))
      if (gRes.status === 'fulfilled') setGainers(norm((gRes as any).value?.trends || []))
      if (lRes.status === 'fulfilled') setLosers(norm((lRes as any).value?.trends || []))
      if (aRes.status === 'fulfilled') setActive(norm((aRes as any).value?.trends || []))
    } catch {}
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadIndices(), loadForex(), loadMovers()])
      .finally(() => { setLoading(false); setLastUpdated(new Date()) })
  }, [loadIndices, loadForex, loadMovers])

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(() => {
      loadIndices(); loadForex(); loadMovers()
      setLastUpdated(new Date())
    }, 60_000)
    return () => clearInterval(id)
  }, [loadIndices, loadForex, loadMovers])

  const moversData = moversTab === 'gainers' ? gainers : moversTab === 'losers' ? losers : active

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title">Markets</h1>
          <p style={{ fontSize:13, marginTop:2, color:'#7D8FA9' }}>Global indices · FX · movers · sector heatmap</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {lastUpdated && (
            <span style={{ fontSize:11, color:'#7D8FA9' }}>
              Updated {lastUpdated.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}
            </span>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:20, background:'rgba(5,150,105,0.1)', border:'1px solid rgba(5,150,105,0.2)' }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#059669', boxShadow:'0 0 6px #059669', animation:'pulse 2s infinite' }}/>
            <span style={{ fontSize:11, fontWeight:600, color:'#059669' }}>Live</span>
          </div>
          <button onClick={() => { loadIndices(); loadForex(); loadMovers(); setLastUpdated(new Date()) }}
            style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600, color:'#4A5568' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom:20 }}>
        {([['overview','Overview'],['forex','Forex'],['movers','Movers'],['sectors','Sectors']] as const).map(([v,l]) => (
          <button key={v} className={`tab-btn ${tab===v?'active':''}`} onClick={() => setTab(v)}>{l}</button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ───────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div>
          {/* Indices table */}
          <div className="card" style={{ marginBottom:20, overflow:'hidden' }}>
            <div style={{ padding:'12px 20px', borderBottom:'1px solid #E2E8F2', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontWeight:700, fontSize:14, color:'#0A1628' }}>Global Indices</span>
              {loading && <span style={{ fontSize:11, color:'#B0BCD0' }}>Loading live data…</span>}
            </div>
            <table className="data-table">
              <thead>
                <tr><th>Index</th><th>Ticker</th><th className="right">Last</th><th className="right">Change</th><th className="right">% Change</th><th className="right">Trend</th></tr>
              </thead>
              <tbody>
                {(indices.length > 0 ? indices : INDEX_TICKERS.map(t => ({ label: t.label, ticker: t.display, price: 0, change: 0, changePct: 0, spark: [] }))).map((idx, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight:600, fontSize:13, color:'#0A1628' }}>{idx.label}</td>
                    <td style={{ fontSize:12, color:'#B0BCD0', fontFamily:'monospace' }}>{idx.ticker}</td>
                    <td className="right" style={{ fontWeight:700, fontSize:13 }}>
                      {idx.price > 0 ? idx.price.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) : <span style={{color:'#B0BCD0'}}>—</span>}
                    </td>
                    <td className={`right ${changeClass(idx.change)}`} style={{ fontSize:13, fontWeight:600 }}>
                      {idx.change !== 0 ? (idx.change > 0 ? '+' : '') + idx.change.toFixed(2) : '—'}
                    </td>
                    <td className={`right ${changeClass(idx.changePct)}`} style={{ fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
                      {idx.changePct !== 0 ? <><span>{idx.changePct >= 0 ? '▲' : '▼'}</span>{Math.abs(idx.changePct).toFixed(2)}%</> : '—'}
                    </td>
                    <td className="right">
                      <SparkLine data={idx.spark || []} positive={idx.changePct >= 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Sector Heatmap */}
          <div className="card" style={{ overflow:'hidden' }}>
            <div style={{ padding:'12px 20px', borderBottom:'1px solid #E2E8F2' }}>
              <span style={{ fontWeight:700, fontSize:14, color:'#0A1628' }}>Sector Heatmap (S&P 500)</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10, padding:16 }}>
              {SECTORS_STATIC.map(s => {
                const intensity = Math.min(Math.abs(s.change) / 2.5, 1)
                const bg = s.change > 0
                  ? `rgba(5,150,105,${0.06 + intensity * 0.18})`
                  : `rgba(220,38,38,${0.06 + intensity * 0.18})`
                const bc = s.change > 0 ? 'rgba(5,150,105,0.25)' : 'rgba(220,38,38,0.25)'
                return (
                  <div key={s.name} style={{ borderRadius:10, padding:'12px 14px', background:bg, border:`1px solid ${bc}`, cursor:'pointer' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#1C2B4A', marginBottom:6, letterSpacing:'0.01em' }}>{s.name}</div>
                    <div style={{ fontWeight:900, fontSize:'1.25rem', color: s.change > 0 ? '#059669' : '#DC2626', letterSpacing:'-0.03em' }}>
                      {s.change > 0 ? '+' : ''}{s.change.toFixed(2)}%
                    </div>
                    <div style={{ fontSize:10, color:'#7D8FA9', marginTop:4 }}>{s.mcap} · {s.top}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── FOREX TAB ──────────────────────────────────────────────────────── */}
      {tab === 'forex' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'12px 20px', borderBottom:'1px solid #E2E8F2', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontWeight:700, fontSize:14, color:'#0A1628' }}>Foreign Exchange Rates</span>
            {loading && <span style={{ fontSize:11, color:'#B0BCD0' }}>Loading…</span>}
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Pair</th><th className="right">Rate</th><th className="right">% Change</th><th className="right">Bid/Ask</th></tr>
            </thead>
            <tbody>
              {(forex.length > 0 ? forex : FOREX_PAIRS.map(p => ({ pair:`${p.from}/${p.to}`, from:p.from, to:p.to, rate:0, changePct:0 }))).map((fx, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:32, height:32, borderRadius:6, background:'#F0F4FA', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#4A5568' }}>
                        {fx.from}
                      </div>
                      <div>
                        <div style={{ fontWeight:700, fontSize:13, color:'#0A1628' }}>{fx.pair}</div>
                        <div style={{ fontSize:11, color:'#B0BCD0' }}>{fx.from} / {fx.to}</div>
                      </div>
                    </div>
                  </td>
                  <td className="right" style={{ fontWeight:700, fontSize:14 }}>
                    {fx.rate > 0 ? fx.rate.toFixed(4) : <span style={{color:'#B0BCD0'}}>—</span>}
                  </td>
                  <td className={`right ${changeClass(fx.changePct ?? 0)}`} style={{ fontSize:13, fontWeight:600 }}>
                    {fx.changePct != null && fx.changePct !== 0 ? `${fx.changePct > 0 ? '+' : ''}${fx.changePct.toFixed(3)}%` : '—'}
                  </td>
                  <td className="right" style={{ fontSize:12, color:'#7D8FA9', fontFamily:'monospace' }}>
                    {fx.rate > 0 ? `${(fx.rate * 0.9998).toFixed(4)} / ${(fx.rate * 1.0002).toFixed(4)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MOVERS TAB ─────────────────────────────────────────────────────── */}
      {tab === 'movers' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'12px 20px', borderBottom:'1px solid #E2E8F2', display:'flex', alignItems:'center', gap:0 }}>
            {([['gainers','▲ Gainers'],['losers','▼ Losers'],['active','⚡ Active']] as const).map(([v,l]) => (
              <button key={v} className={`tab-btn ${moversTab===v?'active':''}`} onClick={() => setMoversTab(v)} style={{ fontSize:12, padding:'4px 14px' }}>{l}</button>
            ))}
            {loading && <span style={{ marginLeft:'auto', fontSize:11, color:'#B0BCD0' }}>Loading…</span>}
          </div>
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>Symbol</th><th>Company</th><th className="right">Price</th><th className="right">% Change</th></tr>
            </thead>
            <tbody>
              {moversData.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign:'center', padding:32, color:'#B0BCD0' }}>
                  {loading ? 'Loading movers…' : 'No data available'}
                </td></tr>
              ) : moversData.map((m, i) => (
                <tr key={i} style={{ cursor:'pointer' }} onClick={() => window.location.href = `/app/company/${m.symbol}`}>
                  <td style={{ fontSize:12, color:'#B0BCD0', fontWeight:700, width:32 }}>{i + 1}</td>
                  <td>
                    <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:900 }}>
                      {m.symbol.slice(0,2)}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight:700, fontSize:13, color:'#0A1628' }}>{m.symbol}</div>
                    <div style={{ fontSize:11, color:'#7D8FA9', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</div>
                  </td>
                  <td className="right" style={{ fontWeight:700, fontSize:13 }}>${m.price.toFixed(2)}</td>
                  <td className={`right ${changeClass(m.changePct)}`} style={{ fontSize:14, fontWeight:800 }}>
                    {m.changePct > 0 ? '+' : ''}{m.changePct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SECTORS TAB ────────────────────────────────────────────────────── */}
      {tab === 'sectors' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
            {SECTORS_STATIC.map(s => {
              const positive = s.change >= 0
              return (
                <div key={s.name} className="card" style={{ padding:'16px 20px' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'#0A1628' }}>{s.name}</div>
                    <div style={{ fontWeight:900, fontSize:'1.125rem', color: positive ? '#059669' : '#DC2626' }}>
                      {positive ? '+' : ''}{s.change.toFixed(2)}%
                    </div>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                    <span style={{ color:'#7D8FA9' }}>Market Cap</span>
                    <span style={{ fontWeight:600, color:'#1C2B4A' }}>{s.mcap}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginTop:4 }}>
                    <span style={{ color:'#7D8FA9' }}>Top Mover</span>
                    <span style={{ fontWeight:600, color: positive ? '#059669' : '#DC2626' }}>{s.top}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

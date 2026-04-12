'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { fmtLarge, fmtPct, fmt, changeClass } from '@/lib/utils'

type Quote = {
  name?: string
  price?: number
  changePct?: number
  marketCap?: number
  pe?: number
}

export default function WatchlistPage() {
  const router = useRouter()
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [loading, setLoading] = useState(false)
  const [newSymbol, setNewSymbol] = useState('')
  const [adding, setAdding] = useState(false)

  async function refreshQuotes(symbols: string[]) {
    if (!symbols.length) {
      setQuotes({})
      setLoading(false)
      return
    }
    setLoading(true)
    const toFetch = symbols.slice(0, 3)
    const results: Record<string, Quote> = {}
    for (const s of toFetch) {
      try {
        const res = await fetch(`/api/quote?symbol=${s}`)
        const d = await res.json() as Quote & { error?: string }
        if (!d.error) results[s] = d
      } catch {}
      await new Promise(r => setTimeout(r, 600))
    }
    setQuotes(results)
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/watchlist')
      .then(r => r.json())
      .then(async d => {
        const symbols: string[] = d.watchlist || []
        setWatchlist(symbols)
        await refreshQuotes(symbols)
      })
      .catch(() => {
        setWatchlist([])
        setQuotes({})
        setLoading(false)
      })
  }, [])

  async function addSymbol() {
    if (!newSymbol.trim()) return
    setAdding(true)
    const res = await fetch('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: newSymbol, action: 'add' }) })
    const d = await res.json()
    const symbols: string[] = d.watchlist || []
    setWatchlist(symbols)
    await refreshQuotes(symbols)
    setNewSymbol('')
    setAdding(false)
  }

  async function removeSymbol(sym: string) {
    const res = await fetch('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: sym, action: 'remove' }) })
    const d = await res.json()
    const symbols: string[] = d.watchlist || []
    setWatchlist(symbols)
    await refreshQuotes(symbols)
  }

  return (
    <div className="page-content" style={{ paddingTop: 20 }}>
      <div className="card mb-4" style={{ padding: '14px 18px', borderRadius: 14, background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A8EAE' }}>Market monitor</div>
            <h1 className="page-title" style={{ marginTop: 2 }}>Watchlist</h1>
            <p className="text-sm mt-0.5" style={{ color: '#7D8FA9' }}>{watchlist.length} symbols tracked</p>
          </div>
          <div className="flex gap-2">
            <input className="input" style={{ width: 170, height: 38, textTransform: 'uppercase', background: '#fff' }} placeholder="Add ticker..." value={newSymbol} onChange={e => setNewSymbol(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && addSymbol()} />
            <button onClick={addSymbol} disabled={adding || !newSymbol.trim()} className="btn btn-primary btn-sm">+ Add</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="metric-card" style={{ borderRadius: 12, padding: '0.95rem 1.1rem' }}>
          <div className="label mb-1">Coverage</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1B4FFF', letterSpacing: '-0.02em' }}>{watchlist.length}</div>
          <div style={{ fontSize: 11.5, color: '#7D8FA9' }}>Tracked tickers</div>
        </div>
        <div className="metric-card" style={{ borderRadius: 12, padding: '0.95rem 1.1rem' }}>
          <div className="label mb-1">Live quotes</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0D9F68', letterSpacing: '-0.02em' }}>{Object.keys(quotes).length}</div>
          <div style={{ fontSize: 11.5, color: '#7D8FA9' }}>{loading ? 'Refreshing…' : 'In session cache'}</div>
        </div>
        <div className="metric-card" style={{ borderRadius: 12, padding: '0.95rem 1.1rem' }}>
          <div className="label mb-1">Session state</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: loading ? '#D97706' : '#1B4FFF', letterSpacing: '-0.02em' }}>{loading ? 'Syncing' : 'Ready'}</div>
          <div style={{ fontSize: 11.5, color: '#7D8FA9' }}>Market snapshot</div>
        </div>
      </div>

      <div className="card overflow-hidden" style={{ borderRadius: 14 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #EAF0F8', background: '#F9FBFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#3B5076' }}>Core symbols</div>
          <div style={{ fontSize: 11, color: '#7890B5' }}>Click a row for details</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Company</th><th className="right">Price</th><th className="right">Change</th><th className="right">Mkt Cap</th><th className="right">P/E</th><th></th></tr></thead>
            <tbody>
              {watchlist.map(sym => {
                const q = quotes[sym]
                return (
                  <tr key={sym} style={{ cursor: 'pointer' }} onClick={() => router.push(`/app/company/${sym}`)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black" style={{ background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)' }}>{sym[0]}</div>
                        <div>
                          <div className="font-bold text-sm" style={{ color: '#0A1628' }}>{sym}</div>
                          {q && <div className="text-xs" style={{ color: '#7D8FA9' }}>{q.name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="right font-bold text-sm">{q ? `$${fmt(q.price)}` : loading ? <span className="skeleton w-16 h-4 inline-block" /> : '—'}</td>
                    <td className={`right font-semibold text-sm ${q ? changeClass(q.changePct) : ''}`}>{q ? fmtPct(q.changePct) : '—'}</td>
                    <td className="right text-sm" style={{ color: '#3D4F6E' }}>{q ? fmtLarge(q.marketCap) : '—'}</td>
                    <td className="right text-sm" style={{ color: '#3D4F6E' }}>{q?.pe > 0 ? `${fmt(q.pe)}x` : '—'}</td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <Link href={`/app/company/${sym}`} onClick={e => e.stopPropagation()} className="btn btn-ghost btn-sm">View</Link>
                        <button onClick={e => { e.stopPropagation(); removeSymbol(sym) }} className="btn btn-danger btn-sm">✕</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {watchlist.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12" style={{ color: '#7D8FA9' }}>No symbols in watchlist. Add one above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

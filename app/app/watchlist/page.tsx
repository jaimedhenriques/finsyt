'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fmtLarge, fmtPct, fmt, changeClass } from '@/lib/utils'

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [quotes, setQuotes] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [newSymbol, setNewSymbol] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    fetch('/api/watchlist').then(r => r.json()).then(d => {
      setWatchlist(d.watchlist || [])
    })
  }, [])

  useEffect(() => {
    if (!watchlist.length) { setLoading(false); return }
    setLoading(true)
    // Fetch first 3 quotes (rate limit)
    async function fetchQuotes() {
      const toFetch = watchlist.slice(0, 3)
      const results: Record<string, any> = {}
      for (const s of toFetch) {
        try {
          const res = await fetch(`/api/quote?symbol=${s}`)
          const d = await res.json()
          if (!d.error) results[s] = d
        } catch {}
        await new Promise(r => setTimeout(r, 600))
      }
      setQuotes(results)
      setLoading(false)
    }
    fetchQuotes()
  }, [watchlist.join(',')])

  async function addSymbol() {
    if (!newSymbol.trim()) return
    setAdding(true)
    const res = await fetch('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: newSymbol, action: 'add' }) })
    const d = await res.json()
    setWatchlist(d.watchlist || [])
    setNewSymbol('')
    setAdding(false)
  }

  async function removeSymbol(sym: string) {
    const res = await fetch('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: sym, action: 'remove' }) })
    const d = await res.json()
    setWatchlist(d.watchlist || [])
  }

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="page-title">Watchlist</h1>
          <p className="text-sm mt-0.5" style={{ color: '#7D8FA9' }}>{watchlist.length} symbols tracked</p>
        </div>
        <div className="flex gap-2">
          <input className="input" style={{ width: 160, height: 38, textTransform: 'uppercase' }} placeholder="Add ticker..." value={newSymbol} onChange={e => setNewSymbol(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && addSymbol()} />
          <button onClick={addSymbol} disabled={adding || !newSymbol.trim()} className="btn btn-primary btn-sm">+ Add</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Company</th><th className="right">Price</th><th className="right">Change</th><th className="right">Mkt Cap</th><th className="right">P/E</th><th></th></tr></thead>
            <tbody>
              {watchlist.map(sym => {
                const q = quotes[sym]
                return (
                  <tr key={sym} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/app/company/${sym}`}>
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

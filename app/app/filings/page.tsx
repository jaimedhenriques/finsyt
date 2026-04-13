'use client'
import { useState } from 'react'

export default function FilingsPage() {
  const [symbol, setSymbol] = useState('AAPL')
  const [filings, setFilings] = useState<any[]>([])
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)

  async function fetchFilings() {
    if (!symbol) return
    setLoading(true)
    try {
      const res = await fetch(`/api/filings?symbol=${symbol.toUpperCase()}`)
      const d = await res.json()
      setFilings(d.filings || [])
      setCompany(d.company || symbol)
    } catch {}
    setLoading(false)
  }

  const formColor: Record<string, string> = { '10-K': 'badge-blue', '10-Q': 'badge-blue', '8-K': 'badge-amber', 'DEF 14A': 'badge-gray', '4': 'badge-gray', 'S-1': 'badge-green' }

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="page-title">SEC Filings</h1>
          <p className="text-sm mt-0.5" style={{ color: '#7D8FA9' }}>Direct access to SEC EDGAR filings</p>
        </div>
      </div>

      <div className="card p-4 mb-5 flex items-center gap-3">
        <input className="input" style={{ maxWidth: 200, textTransform: 'uppercase' }} placeholder="Ticker (e.g. AAPL)" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && fetchFilings()} />
        <button onClick={fetchFilings} disabled={loading} className="btn btn-primary btn-sm">{loading ? 'Loading...' : 'Fetch Filings'}</button>
        {company && <span className="text-sm font-semibold" style={{ color: '#3D4F6E' }}>{company}</span>}
      </div>

      {filings.length > 0 && (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead><tr><th>Form Type</th><th>Filing Date</th><th>Accession #</th><th></th></tr></thead>
            <tbody>
              {filings.map((f, i) => (
                <tr key={i}>
                  <td><span className={`badge ${formColor[f.form] || 'badge-gray'}`}>{f.form}</span></td>
                  <td className="text-sm" style={{ color: '#3D4F6E' }}>{f.date}</td>
                  <td className="text-xs font-mono" style={{ color: '#7D8FA9' }}>{f.accessionNumber}</td>
                  <td><a href={f.docUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">View on SEC →</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!filings.length && !loading && (
        <div className="text-center py-16 card">
          <div className="text-3xl mb-3">▣</div>
          <p className="font-semibold mb-1" style={{ color: '#3D4F6E' }}>Enter a ticker above to fetch SEC filings</p>
          <p className="text-sm" style={{ color: '#7D8FA9' }}>Supports AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA, JPM, and more</p>
        </div>
      )}
    </div>
  )
}

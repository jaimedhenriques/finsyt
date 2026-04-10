'use client'
import { useState } from 'react'

const SAMPLE_ALERTS = [
  { id: 1, symbol: 'NVDA', type: 'Price above', threshold: 900, triggered: true, created: '2024-01-10' },
  { id: 2, symbol: 'AAPL', type: 'Price below', threshold: 180, triggered: false, created: '2024-01-08' },
  { id: 3, symbol: 'TSLA', type: 'Change > 5%', threshold: 5, triggered: true, created: '2024-01-05' },
]

export default function AlertsPage() {
  const [alerts, setAlerts] = useState(SAMPLE_ALERTS)
  const [symbol, setSymbol] = useState('')
  const [type, setType] = useState('Price above')
  const [threshold, setThreshold] = useState('')

  function addAlert() {
    if (!symbol || !threshold) return
    setAlerts(prev => [...prev, { id: Date.now(), symbol: symbol.toUpperCase(), type, threshold: parseFloat(threshold), triggered: false, created: new Date().toISOString().slice(0, 10) }])
    setSymbol(''); setThreshold('')
  }

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="page-title">Alerts</h1>
          <p className="text-sm mt-0.5" style={{ color: '#7D8FA9' }}>Price & signal notifications</p>
        </div>
        <span className="badge badge-red">{alerts.filter(a => a.triggered).length} triggered</span>
      </div>

      {/* Add alert */}
      <div className="card p-5 mb-6">
        <div className="section-title">Create Alert</div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label mb-1.5 block">Ticker</label>
            <input className="input" style={{ width: 120 }} placeholder="AAPL" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label mb-1.5 block">Condition</label>
            <select className="input" style={{ width: 160 }} value={type} onChange={e => setType(e.target.value)}>
              <option>Price above</option>
              <option>Price below</option>
              <option>Change &gt; 5%</option>
              <option>Change &lt; -5%</option>
              <option>Volume spike</option>
            </select>
          </div>
          <div>
            <label className="label mb-1.5 block">Value</label>
            <input className="input" style={{ width: 120 }} type="number" placeholder="e.g. 200" value={threshold} onChange={e => setThreshold(e.target.value)} />
          </div>
          <button onClick={addAlert} className="btn btn-primary">+ Add Alert</button>
        </div>
      </div>

      {/* Alerts list */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Symbol</th><th>Condition</th><th>Value</th><th>Created</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {alerts.map(a => (
              <tr key={a.id}>
                <td><span className="badge badge-blue">{a.symbol}</span></td>
                <td className="text-sm" style={{ color: '#3D4F6E' }}>{a.type}</td>
                <td className="text-sm font-semibold">{a.threshold}</td>
                <td className="text-sm" style={{ color: '#7D8FA9' }}>{a.created}</td>
                <td><span className={`badge ${a.triggered ? 'badge-red' : 'badge-green'}`}>{a.triggered ? '🔔 Triggered' : '◎ Watching'}</span></td>
                <td><button onClick={() => setAlerts(prev => prev.filter(x => x.id !== a.id))} className="btn btn-danger btn-sm">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

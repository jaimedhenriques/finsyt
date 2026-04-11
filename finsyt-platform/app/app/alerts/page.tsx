'use client'
import { useState, useEffect } from 'react'

type Alert = {
  id: number
  symbol: string
  type: 'price_above' | 'price_below' | 'change_up' | 'change_down' | 'volume_spike' | 'news'
  threshold: number
  triggered: boolean
  triggeredAt?: string
  created: string
  currentPrice?: number
  note?: string
}

const TYPE_LABELS: Record<string, string> = {
  price_above:  'Price rises above',
  price_below:  'Price falls below',
  change_up:    'Daily change >',
  change_down:  'Daily change <',
  volume_spike: 'Volume spike >',
  news:         'Any news mention',
}

const SAMPLE: Alert[] = [
  { id:1, symbol:'NVDA', type:'price_above', threshold:1000,  triggered:false, created:'2026-04-01', note:'Breakout level' },
  { id:2, symbol:'AAPL', type:'price_below', threshold:170,   triggered:false, created:'2026-04-02', note:'Support zone' },
  { id:3, symbol:'TSLA', type:'change_up',   threshold:5,     triggered:true,  triggeredAt:'2026-04-10 14:22', created:'2026-04-05', note:'Big move alert' },
  { id:4, symbol:'MSFT', type:'price_above', threshold:400,   triggered:false, created:'2026-04-06' },
  { id:5, symbol:'META', type:'change_down', threshold:-4,    triggered:true,  triggeredAt:'2026-04-09 09:45', created:'2026-04-08' },
]

export default function AlertsPage() {
  const [alerts, setAlerts]   = useState<Alert[]>(SAMPLE)
  const [symbol, setSymbol]   = useState('')
  const [type, setType]       = useState<Alert['type']>('price_above')
  const [threshold, setTh]    = useState('')
  const [note, setNote]       = useState('')
  const [filter, setFilter]   = useState<'all'|'active'|'triggered'>('all')
  const [showForm, setShowForm] = useState(false)

  const triggered = alerts.filter(a => a.triggered)
  const active    = alerts.filter(a => !a.triggered)
  const filtered  = filter === 'all' ? alerts : filter === 'triggered' ? triggered : active

  function addAlert() {
    if (!symbol || !threshold) return
    const a: Alert = {
      id: Date.now(),
      symbol: symbol.toUpperCase(),
      type,
      threshold: parseFloat(threshold),
      triggered: false,
      created: new Date().toISOString().slice(0,10),
      note: note || undefined,
    }
    setAlerts(prev => [a, ...prev])
    setSymbol(''); setTh(''); setNote(''); setShowForm(false)
  }

  function dismiss(id: number) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, triggered: false } : a))
  }

  function remove(id: number) {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  const needsThreshold = !['news'].includes(type)

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="page-title">Alerts</h1>
          <p style={{ color:'#7D8FA9', fontSize:13 }}>Price, change & news notifications for your watchlist</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn btn-primary">
          {showForm ? '✕ Cancel' : '+ New Alert'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label:'Total Alerts',      value:alerts.length,     color:'#1B4FFF' },
          { label:'Active Watching',   value:active.length,     color:'#059669' },
          { label:'Triggered Today',   value:triggered.length,  color:'#EF4444' },
        ].map(s => (
          <div key={s.label} className="metric-card">
            <div className="label mb-1">{s.label}</div>
            <div style={{ fontSize:28, fontWeight:900, color:s.color, letterSpacing:'-0.02em' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Triggered banner */}
      {triggered.length > 0 && (
        <div className="card p-4 mb-5" style={{ borderLeft:'4px solid #EF4444', background:'#FFF5F5' }}>
          <div style={{ fontWeight:700, color:'#EF4444', marginBottom:8 }}>🔔 {triggered.length} alert{triggered.length > 1 ? 's' : ''} triggered</div>
          <div className="flex flex-wrap gap-2">
            {triggered.map(a => (
              <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, background:'#fff', border:'1px solid #FCA5A5', borderRadius:8, padding:'6px 12px' }}>
                <span style={{ fontWeight:700, color:'#0A1628' }}>{a.symbol}</span>
                <span style={{ fontSize:12, color:'#7D8FA9' }}>{TYPE_LABELS[a.type]} {a.threshold}</span>
                <span style={{ fontSize:11, color:'#9CA3AF' }}>{a.triggeredAt}</span>
                <button onClick={() => dismiss(a.id)} style={{ fontSize:11, color:'#EF4444', fontWeight:700, marginLeft:4 }}>Dismiss</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="card p-5 mb-6">
          <div className="section-title mb-4">Create New Alert</div>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label mb-1 block">Ticker *</label>
              <input className="input" style={{ width:100, textTransform:'uppercase' }} placeholder="AAPL"
                value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
                onKeyDown={e => e.key==='Enter' && addAlert()} />
            </div>
            <div>
              <label className="label mb-1 block">Condition *</label>
              <select className="input" style={{ width:180 }} value={type} onChange={e => setType(e.target.value as any)}>
                {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {needsThreshold && (
              <div>
                <label className="label mb-1 block">Value *</label>
                <input className="input" style={{ width:110 }} type="number" placeholder="e.g. 200"
                  value={threshold} onChange={e => setTh(e.target.value)} />
              </div>
            )}
            <div>
              <label className="label mb-1 block">Note (optional)</label>
              <input className="input" style={{ width:180 }} placeholder="e.g. Breakout level"
                value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <button onClick={addAlert} disabled={!symbol || (needsThreshold && !threshold)} className="btn btn-primary">
              Create Alert
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="tab-bar mb-4">
        {[['all','All'], ['active','Active'], ['triggered','Triggered']].map(([v,l]) => (
          <button key={v} className={`tab-btn ${filter===v?'active':''}`} onClick={() => setFilter(v as any)}>
            {l} {v==='triggered'&&triggered.length>0 && <span style={{ marginLeft:4, background:'#EF4444', color:'#fff', borderRadius:10, padding:'0 5px', fontSize:10 }}>{triggered.length}</span>}
          </button>
        ))}
      </div>

      {/* Alerts table */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Condition</th>
              <th className="right">Value</th>
              <th>Note</th>
              <th>Created</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id}>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:12 }}>
                      {a.symbol[0]}
                    </div>
                    <span style={{ fontWeight:700, color:'#0A1628', fontSize:14 }}>{a.symbol}</span>
                  </div>
                </td>
                <td style={{ fontSize:13, color:'#3D4F6E' }}>{TYPE_LABELS[a.type]}</td>
                <td className="right" style={{ fontWeight:700, fontSize:14 }}>
                  {a.type.includes('change') ? `${a.threshold}%` : a.type === 'news' ? '—' : `$${a.threshold}`}
                </td>
                <td style={{ fontSize:12, color:'#7D8FA9' }}>{a.note || '—'}</td>
                <td style={{ fontSize:12, color:'#7D8FA9' }}>{a.created}</td>
                <td>
                  {a.triggered ? (
                    <div>
                      <span className="badge badge-red">🔔 Triggered</span>
                      {a.triggeredAt && <div style={{ fontSize:10, color:'#9CA3AF', marginTop:2 }}>{a.triggeredAt}</div>}
                    </div>
                  ) : (
                    <span className="badge badge-green">◎ Watching</span>
                  )}
                </td>
                <td>
                  <div className="flex gap-1 justify-end">
                    {a.triggered && (
                      <button onClick={() => dismiss(a.id)} className="btn btn-ghost btn-sm">Dismiss</button>
                    )}
                    <button onClick={() => remove(a.id)} className="btn btn-danger btn-sm">✕</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign:'center', padding:'48px 0', color:'#7D8FA9' }}>
                  No {filter === 'all' ? '' : filter} alerts. {filter === 'all' && <span>Click "+ New Alert" to create one.</span>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

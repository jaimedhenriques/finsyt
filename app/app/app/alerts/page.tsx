'use client'
import { useEffect, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Alert {
  id:         string
  symbol:     string
  name:       string
  type:       'price_above' | 'price_below' | 'pct_change' | 'volume_spike' | 'news'
  threshold:  number
  currentVal: number
  triggered:  boolean
  active:     boolean
  created:    string
  lastChecked?: string
  note?:      string
}

type AlertType = Alert['type']

const ALERT_TYPES: { value: AlertType; label: string; desc: string }[] = [
  { value:'price_above',  label:'Price Above',     desc:'Alert when price crosses above threshold' },
  { value:'price_below',  label:'Price Below',     desc:'Alert when price falls below threshold'   },
  { value:'pct_change',   label:'% Change',        desc:'Alert on % move in a session'             },
  { value:'volume_spike', label:'Volume Spike',    desc:'Alert when volume exceeds 2× average'     },
  { value:'news',         label:'News Mention',    desc:'Alert when company appears in news'       },
]

const DEMO_ALERTS: Alert[] = [
  { id:'1', symbol:'NVDA', name:'NVIDIA Corp.', type:'price_above',  threshold:1000, currentVal:924.8,  triggered:false, active:true,  created:'2026-04-10' },
  { id:'2', symbol:'AAPL', name:'Apple Inc.',   type:'price_below',  threshold:170,  currentVal:189.3,  triggered:false, active:true,  created:'2026-04-08' },
  { id:'3', symbol:'TSLA', name:'Tesla Inc.',   type:'pct_change',   threshold:5,    currentVal:3.2,    triggered:false, active:true,  created:'2026-04-11' },
  { id:'4', symbol:'META', name:'Meta Platforms',type:'price_above', threshold:500,  currentVal:529.3,  triggered:true,  active:true,  created:'2026-04-05', note:'META broke $500' },
  { id:'5', symbol:'MSFT', name:'Microsoft',    type:'volume_spike', threshold:0,    currentVal:0,      triggered:false, active:false, created:'2026-04-01' },
]

export default function AlertsPage() {
  const [alerts, setAlerts]     = useState<Alert[]>(DEMO_ALERTS)
  const [showNew, setShowNew]   = useState(false)
  const [filterTab, setFilterTab] = useState<'all'|'active'|'triggered'>('all')
  const [quotes, setQuotes]     = useState<Record<string,number>>({})
  const [loading, setLoading]   = useState(false)

  // Form state
  const [form, setForm] = useState({ symbol:'', type:'price_above' as AlertType, threshold:'', note:'' })
  const [searching, setSearching] = useState(false)
  const [foundName, setFoundName] = useState('')

  // Load live quotes for active alerts
  useEffect(() => {
    const symbols = [...new Set(alerts.map(a => a.symbol))]
    if (!symbols.length) return
    setLoading(true)
    Promise.allSettled(
      symbols.map(sym => fetch(`/api/quote?symbol=${sym}`).then(r => r.json()).then(d => ({ sym, price: d.price || 0 })))
    ).then(results => {
      const map: Record<string, number> = {}
      results.forEach(r => { if (r.status === 'fulfilled' && r.value.price) map[r.value.sym] = r.value.price })
      setQuotes(map)
      // Check triggers
      setAlerts(prev => prev.map(a => {
        const price = map[a.symbol]
        if (!price || !a.active) return a
        const nowTriggered =
          (a.type === 'price_above' && price >= a.threshold) ||
          (a.type === 'price_below' && price <= a.threshold)
        return { ...a, currentVal: price, triggered: nowTriggered || a.triggered }
      }))
    }).finally(() => setLoading(false))
  }, []) // eslint-disable-line

  async function lookupSymbol(sym: string) {
    if (!sym) return
    setSearching(true)
    try {
      const res  = await fetch(`/api/quote?symbol=${sym.toUpperCase()}`)
      const data = await res.json()
      setFoundName(data.name || data.companyName || '')
      setForm(f => ({ ...f, threshold: String(Math.round((data.price || 0) * 100) / 100) }))
    } catch {}
    setSearching(false)
  }

  function addAlert() {
    if (!form.symbol || !form.threshold) return
    const newAlert: Alert = {
      id:         Date.now().toString(),
      symbol:     form.symbol.toUpperCase(),
      name:       foundName || form.symbol.toUpperCase(),
      type:       form.type,
      threshold:  parseFloat(form.threshold),
      currentVal: quotes[form.symbol.toUpperCase()] || 0,
      triggered:  false,
      active:     true,
      created:    new Date().toISOString().slice(0,10),
      note:       form.note || undefined,
    }
    setAlerts(prev => [newAlert, ...prev])
    setForm({ symbol:'', type:'price_above', threshold:'', note:'' })
    setFoundName('')
    setShowNew(false)
  }

  function toggleAlert(id: string) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a))
  }
  function deleteAlert(id: string) {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }
  function dismissTrigger(id: string) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, triggered: false } : a))
  }

  const filtered = alerts.filter(a =>
    filterTab === 'all' ? true : filterTab === 'active' ? a.active && !a.triggered : a.triggered
  )

  const typeLabel = (t: AlertType) => ALERT_TYPES.find(x => x.value === t)?.label || t
  const triggeredCount = alerts.filter(a => a.triggered).length

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title">Alerts</h1>
          <p style={{ fontSize:13, marginTop:2, color:'#7D8FA9' }}>Price, volume & news alerts across your watchlist</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {loading && <span style={{ fontSize:11, color:'#B0BCD0' }}>Checking prices…</span>}
          <button onClick={() => setShowNew(true)}
            style={{ padding:'8px 16px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
            + New Alert
          </button>
        </div>
      </div>

      {/* Triggered banner */}
      {triggeredCount > 0 && (
        <div style={{ marginBottom:16, padding:'12px 16px', borderRadius:10, background:'rgba(220,38,38,0.06)', border:'1.5px solid rgba(220,38,38,0.2)', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:18 }}>🔔</span>
          <span style={{ fontSize:13, fontWeight:700, color:'#DC2626' }}>{triggeredCount} alert{triggeredCount>1?'s':''} triggered</span>
          <span style={{ fontSize:12, color:'#7D8FA9' }}>Review and dismiss below</span>
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'Total Alerts',    value: alerts.length,                            color:'#1B4FFF' },
          { label:'Active',          value: alerts.filter(a => a.active).length,      color:'#059669' },
          { label:'Triggered',       value: triggeredCount,                           color:'#DC2626' },
          { label:'Paused',          value: alerts.filter(a => !a.active).length,     color:'#7D8FA9' },
        ].map(card => (
          <div key={card.label} className="metric-card">
            <div style={{ fontSize:11, fontWeight:600, color:'#7D8FA9', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6 }}>{card.label}</div>
            <div style={{ fontWeight:900, fontSize:'1.75rem', color: card.color, letterSpacing:'-0.03em' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="tab-bar" style={{ marginBottom:16 }}>
        {([['all','All'],['active','Active'],['triggered','Triggered 🔔']] as const).map(([v,l]) => (
          <button key={v} className={`tab-btn ${filterTab===v?'active':''}`} onClick={() => setFilterTab(v)}>{l}</button>
        ))}
      </div>

      {/* Alerts list */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {filtered.length === 0 ? (
          <div className="card" style={{ padding:48, textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🔕</div>
            <div style={{ fontWeight:700, fontSize:15, color:'#0A1628', marginBottom:6 }}>No alerts here</div>
            <div style={{ fontSize:13, color:'#7D8FA9' }}>Create your first alert to get notified when prices move</div>
          </div>
        ) : filtered.map(alert => {
          const live = quotes[alert.symbol]
          const progress = alert.type === 'price_above'
            ? Math.min((live || alert.currentVal) / alert.threshold, 1.1)
            : alert.type === 'price_below'
            ? Math.min(alert.threshold / (live || alert.currentVal || 1), 1.1)
            : null

          return (
            <div key={alert.id} className="card" style={{
              padding:'14px 18px',
              border: alert.triggered ? '1.5px solid rgba(220,38,38,0.35)' : !alert.active ? '1px solid #E2E8F2' : '1px solid #E2E8F2',
              background: alert.triggered ? 'rgba(220,38,38,0.02)' : !alert.active ? '#FAFAFA' : '#fff',
              opacity: !alert.active ? 0.65 : 1,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                {/* Status dot */}
                <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background: alert.triggered ? '#DC2626' : alert.active ? '#059669' : '#B0BCD0', boxShadow: alert.triggered ? '0 0 6px #DC2626' : '' }} />

                {/* Symbol */}
                <div style={{ width:40, height:40, borderRadius:10, background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:12, flexShrink:0 }}>
                  {alert.symbol.slice(0,3)}
                </div>

                {/* Info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontWeight:800, fontSize:14, color:'#0A1628' }}>{alert.symbol}</span>
                    <span style={{ fontSize:12, color:'#7D8FA9' }}>{alert.name}</span>
                    {alert.triggered && <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'rgba(220,38,38,0.1)', color:'#DC2626' }}>TRIGGERED</span>}
                    {!alert.active && <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#F0F4FA', color:'#7D8FA9' }}>PAUSED</span>}
                  </div>
                  <div style={{ fontSize:12, color:'#7D8FA9', marginTop:2 }}>
                    {typeLabel(alert.type)}
                    {alert.threshold > 0 && <> · threshold <strong>${alert.threshold.toLocaleString()}</strong></>}
                    {live && <> · live <strong style={{ color: alert.triggered ? '#DC2626' : '#059669' }}>${live.toFixed(2)}</strong></>}
                    {alert.note && <> · {alert.note}</>}
                  </div>
                  {/* Progress bar for price alerts */}
                  {progress !== null && alert.active && (
                    <div style={{ marginTop:8, height:3, borderRadius:2, background:'#F0F4FA', overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${Math.min(progress,1)*100}%`, borderRadius:2, background: alert.triggered ? '#DC2626' : '#1B4FFF', transition:'width 0.5s ease' }} />
                    </div>
                  )}
                </div>

                {/* Created */}
                <div style={{ fontSize:11, color:'#B0BCD0', flexShrink:0, textAlign:'right' }}>
                  <div>{alert.created}</div>
                </div>

                {/* Actions */}
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  {alert.triggered && (
                    <button onClick={() => dismissTrigger(alert.id)}
                      style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(220,38,38,0.3)', background:'rgba(220,38,38,0.05)', color:'#DC2626', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                      Dismiss
                    </button>
                  )}
                  <button onClick={() => toggleAlert(alert.id)}
                    style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #E2E8F2', background:'#F8FAFD', color:'#4A5568', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                    {alert.active ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => deleteAlert(alert.id)}
                    style={{ padding:'4px 8px', borderRadius:6, border:'none', background:'none', color:'#B0BCD0', fontSize:13, cursor:'pointer' }}>
                    ×
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* New Alert Modal */}
      {showNew && (
        <>
          <div onClick={() => setShowNew(false)} style={{ position:'fixed', inset:0, background:'rgba(8,14,26,0.4)', zIndex:1000, backdropFilter:'blur(2px)' }} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:1001, width:460, maxWidth:'calc(100vw - 32px)', background:'#fff', borderRadius:16, boxShadow:'0 16px 64px rgba(0,0,0,0.15)', overflow:'hidden' }}>
            <div style={{ padding:'16px 20px', background:'linear-gradient(135deg,#080E1A,#0A1220)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontWeight:800, fontSize:15, color:'#fff' }}>Create Alert</span>
              <button onClick={() => setShowNew(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', fontSize:20, cursor:'pointer', lineHeight:1 }}>×</button>
            </div>
            <div style={{ padding:24 }}>
              {/* Symbol */}
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>Symbol</label>
                <div style={{ display:'flex', gap:8 }}>
                  <input value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                    placeholder="e.g. AAPL, MSFT, NVDA"
                    style={{ flex:1, padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none' }} />
                  <button onClick={() => lookupSymbol(form.symbol)} disabled={!form.symbol || searching}
                    style={{ padding:'9px 14px', borderRadius:8, border:'none', background:'#1B4FFF', color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                    {searching ? '…' : 'Lookup'}
                  </button>
                </div>
                {foundName && <div style={{ fontSize:12, color:'#059669', marginTop:4 }}>✓ {foundName}</div>}
              </div>

              {/* Alert type */}
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>Alert Type</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                  {ALERT_TYPES.map(t => (
                    <button key={t.value} onClick={() => setForm(f => ({ ...f, type: t.value }))}
                      style={{ padding:'8px 10px', borderRadius:8, border:'1.5px solid', textAlign:'left', cursor:'pointer', transition:'all 0.1s',
                        borderColor: form.type===t.value ? '#1B4FFF' : '#E2E8F2',
                        background:  form.type===t.value ? 'rgba(27,79,255,0.05)' : '#fff',
                      }}>
                      <div style={{ fontSize:12, fontWeight:700, color: form.type===t.value ? '#1B4FFF' : '#1C2B4A' }}>{t.label}</div>
                      <div style={{ fontSize:10, color:'#7D8FA9', marginTop:2 }}>{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Threshold */}
              {form.type !== 'news' && form.type !== 'volume_spike' && (
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>
                    {form.type === 'pct_change' ? 'Change % Threshold' : 'Price Threshold ($)'}
                  </label>
                  <input type="number" value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
                    placeholder={form.type === 'pct_change' ? 'e.g. 5 for 5%' : 'e.g. 200.00'}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
                </div>
              )}

              {/* Note */}
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>Note (optional)</label>
                <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Remind yourself why you set this alert"
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
              </div>

              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => setShowNew(false)}
                  style={{ flex:1, padding:10, borderRadius:10, border:'1.5px solid #E2E8F2', background:'#fff', color:'#7D8FA9', fontWeight:600, fontSize:13, cursor:'pointer' }}>
                  Cancel
                </button>
                <button onClick={addAlert} disabled={!form.symbol}
                  style={{ flex:2, padding:10, borderRadius:10, border:'none', background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                  Create Alert
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

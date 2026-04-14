'use client'
import { useEffect, useState } from 'react'
import { fmt, fmtPct } from '@/lib/utils'

interface Alert {
  id: string
  symbol: string
  name: string
  type: 'price_above' | 'price_below' | 'pct_change' | 'volume_spike' | 'news'
  threshold: number
  currentVal: number
  triggered: boolean
  active: boolean
  created: string
  lastChecked?: string
  note?: string
}

type AlertType = Alert['type']

const ALERT_TYPES: { value: AlertType; label: string; desc: string }[] = [
  { value: 'price_above', label: 'Price Above', desc: 'Alert when price crosses above threshold' },
  { value: 'price_below', label: 'Price Below', desc: 'Alert when price falls below threshold' },
  { value: 'pct_change', label: '% Change', desc: 'Alert on % move in a session' },
  { value: 'volume_spike', label: 'Volume Spike', desc: 'Alert when volume exceeds 2× average' },
  { value: 'news', label: 'News Mention', desc: 'Alert when company appears in news' },
]

const DEMO_ALERTS: Alert[] = [
  { id: '1', symbol: 'NVDA', name: 'NVIDIA Corp.', type: 'price_above', threshold: 1000, currentVal: 924.8, triggered: false, active: true, created: '2026-04-10' },
  { id: '2', symbol: 'AAPL', name: 'Apple Inc.', type: 'price_below', threshold: 170, currentVal: 189.3, triggered: false, active: true, created: '2026-04-08' },
  { id: '3', symbol: 'TSLA', name: 'Tesla Inc.', type: 'pct_change', threshold: 5, currentVal: 3.2, triggered: false, active: true, created: '2026-04-11' },
  { id: '4', symbol: 'META', name: 'Meta Platforms', type: 'price_above', threshold: 500, currentVal: 529.3, triggered: true, active: true, created: '2026-04-05', note: 'META broke $500' },
  { id: '5', symbol: 'MSFT', name: 'Microsoft', type: 'volume_spike', threshold: 0, currentVal: 0, triggered: false, active: false, created: '2026-04-01' },
]

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>(DEMO_ALERTS)
  const [showNew, setShowNew] = useState(false)
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'triggered'>('all')
  const [quotes, setQuotes] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Form state
  const [form, setForm] = useState({ symbol: '', type: 'price_above' as AlertType, threshold: '', note: '' })
  const [searching, setSearching] = useState(false)
  const [foundName, setFoundName] = useState('')

  // Check live prices every 30s
  const checkPrices = async () => {
    const symbols = [...new Set(alerts.map(a => a.symbol))]
    if (!symbols.length) return
    setLoading(true)
    try {
      const results = await Promise.allSettled(
        symbols.map(sym => fetch(`/api/quote?symbol=${sym}`).then(r => r.json()).then(d => ({ sym, price: d.price || 0 })))
      )
      const map: Record<string, number> = {}
      results.forEach(r => { if (r.status === 'fulfilled' && r.value.price) map[r.value.sym] = r.value.price })
      setQuotes(map)
      setLastUpdate(new Date())

      // Update alerts with current values and check triggers
      setAlerts(prev => prev.map(a => {
        const price = map[a.symbol]
        if (!price || !a.active) return a
        const nowTriggered =
          (a.type === 'price_above' && price >= a.threshold) ||
          (a.type === 'price_below' && price <= a.threshold)
        return { ...a, currentVal: price, triggered: nowTriggered || a.triggered }
      }))
    } catch (e) {
      console.error('Price check failed:', e)
    } finally {
      setLoading(false)
    }
  }

  // Initial load
  useEffect(() => {
    checkPrices()
  }, []) // eslint-disable-line

  // Auto-refresh every 30s
  useEffect(() => {
    if (!alerts.length) return
    const id = setInterval(checkPrices, 30_000)
    return () => clearInterval(id)
  }, [alerts])

  async function lookupSymbol(sym: string) {
    if (!sym) return
    setSearching(true)
    try {
      const res = await fetch(`/api/quote?symbol=${sym.toUpperCase()}`)
      const data = await res.json()
      setFoundName(data.name || data.companyName || '')
      setForm(f => ({ ...f, threshold: String(Math.round((data.price || 0) * 100) / 100) }))
    } catch { }
    setSearching(false)
  }

  function addAlert() {
    if (!form.symbol || !form.threshold) return
    const newAlert: Alert = {
      id: Date.now().toString(),
      symbol: form.symbol.toUpperCase(),
      name: foundName || form.symbol.toUpperCase(),
      type: form.type,
      threshold: parseFloat(form.threshold),
      currentVal: quotes[form.symbol.toUpperCase()] || 0,
      triggered: false,
      active: true,
      created: new Date().toISOString().slice(0, 10),
      note: form.note || undefined,
    }
    setAlerts(prev => [newAlert, ...prev])
    setForm({ symbol: '', type: 'price_above', threshold: '', note: '' })
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
  const activeCount = alerts.filter(a => a.active).length

  return (
    <div style={{ padding: '1.75rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 800, color: '#0A1628', letterSpacing: '-0.03em', margin: 0 }}>Alerts</h1>
          <p style={{ fontSize: 13, marginTop: 4, color: '#9BAFC8' }}>Price, volume & news alerts · live checks every 30s</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastUpdate && (
            <span style={{ fontSize: 11, color: '#B0BCD0' }}>
              {loading ? '🔄 Checking…' : `✓ ${lastUpdate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
            </span>
          )}
          <button onClick={() => setShowNew(true)}
            style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            + New Alert
          </button>
        </div>
      </div>

      {/* Triggered banner */}
      {triggeredCount > 0 && (
        <div style={{ marginBottom: 20, padding: '16px', borderRadius: 10, background: '#FEF2F2', border: '1.5px solid #FECACA', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>🔔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#DC2626' }}>{triggeredCount} alert{triggeredCount > 1 ? 's' : ''} triggered!</div>
            <div style={{ fontSize: 12, color: '#9BAFC8', marginTop: 2 }}>Your watchlist is moving. Review and dismiss below.</div>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total', value: alerts.length, color: '#1B4FFF' },
          { label: 'Active', value: activeCount, color: '#059669' },
          { label: 'Triggered', value: triggeredCount, color: '#DC2626' },
          { label: 'Paused', value: alerts.filter(a => !a.active).length, color: '#9BAFC8' },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9BAFC8', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontWeight: 800, fontSize: '1.25rem', color: card.color, letterSpacing: '-0.01em' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #E2E8F2' }}>
        {(['all', 'active', 'triggered'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilterTab(tab)}
            style={{
              padding: '12px 16px',
              fontWeight: 600,
              fontSize: 14,
              color: filterTab === tab ? '#1B4FFF' : '#7D8FA9',
              borderBottom: filterTab === tab ? '2px solid #1B4FFF' : '2px solid transparent',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {tab === 'triggered' ? `${tab} 🔔` : tab}
          </button>
        ))}
      </div>

      {/* New alert form */}
      {showNew && (
        <div className="card" style={{ padding: 24, marginBottom: 20, border: '2px solid #1B4FFF' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0A1628', margin: 0 }}>Create New Alert</h2>
            <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9BAFC8' }}>✕</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#9BAFC8', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>Symbol</label>
              <input value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                onBlur={() => form.symbol && lookupSymbol(form.symbol)}
                placeholder="e.g. AAPL"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #E2E8F2', fontSize: 13, fontFamily: 'inherit', textTransform: 'uppercase' }} />
              {searching && <div style={{ fontSize: 11, color: '#9BAFC8', marginTop: 4 }}>Looking up…</div>}
              {foundName && <div style={{ fontSize: 11, color: '#059669', marginTop: 4 }}>✓ {foundName}</div>}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#9BAFC8', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>Alert Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as AlertType }))}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #E2E8F2', fontSize: 13, fontFamily: 'inherit' }}>
                {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#9BAFC8', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>Threshold</label>
            <input type="number" value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
              placeholder="e.g. 150"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #E2E8F2', fontSize: 13, fontFamily: 'inherit' }} />
            <div style={{ fontSize: 11, color: '#7D8FA9', marginTop: 4 }}>
              {form.type === 'price_above' && 'Alert when price reaches or exceeds this level'}
              {form.type === 'price_below' && 'Alert when price drops to or below this level'}
              {form.type === 'pct_change' && 'Alert on this % daily move'}
              {form.type === 'volume_spike' && 'Alert when volume exceeds 2× the 20-day average'}
              {form.type === 'news' && 'Alert when company appears in major news'}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#9BAFC8', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>Note (optional)</label>
            <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="e.g. This is my price target"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #E2E8F2', fontSize: 13, fontFamily: 'inherit' }} />
          </div>

          <button onClick={addAlert} disabled={!form.symbol || !form.threshold}
            style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: form.symbol && form.threshold ? 'linear-gradient(135deg,#1B4FFF,#0D9FE8)' : '#D0D8E8', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%' }}>
            Create Alert
          </button>
        </div>
      )}

      {/* Alerts list */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{filterTab === 'triggered' ? '🔕' : '📋'}</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0A1628', marginBottom: 6 }}>
            {filterTab === 'triggered' ? 'No alerts triggered' : filterTab === 'active' ? 'No active alerts' : 'No alerts yet'}
          </div>
          <div style={{ fontSize: 13, color: '#9BAFC8' }}>
            {filterTab === 'all' && 'Create your first alert to get notified when prices move'}
            {filterTab === 'active' && 'YouYou've paused all your alerts#39;ve paused all your alerts'}
            {filterTab === 'triggered' && 'All quiet—keep monitoring'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(alert => {
            const live = quotes[alert.symbol] || alert.currentVal
            const change = live - alert.currentVal
            const isNear = alert.type === 'price_above'
              ? (live / alert.threshold) >= 0.98 && (live / alert.threshold) <= 1.02
              : alert.type === 'price_below'
              ? (alert.threshold / live) >= 0.98 && (alert.threshold / live) <= 1.02
              : false

            return (
              <div key={alert.id} className="card" style={{
                padding: 16,
                border: alert.triggered ? '2px solid #DC2626' : isNear ? '2px solid #F59E0B' : '1px solid #E2E8F2',
                background: alert.triggered ? '#FEF2F2' : isNear ? '#FFFBEB' : '#fff',
                opacity: !alert.active ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {/* Status dot */}
                  <div style={{
                    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                    background: alert.triggered ? '#DC2626' : isNear ? '#F59E0B' : alert.active ? '#059669' : '#B0BCD0',
                    boxShadow: alert.triggered ? '0 0 8px #DC2626' : isNear ? '0 0 8px #F59E0B' : 'none'
                  }} />

                  {/* Symbol badge */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 10,
                    background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 900, fontSize: 14, flexShrink: 0
                  }}>
                    {alert.symbol.slice(0, 2)}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1628' }}>{alert.symbol}</div>
                        <div style={{ fontSize: 12, color: '#9BAFC8', marginTop: 2 }}>{alert.name}</div>
                      </div>
                    </div>
                    {alert.note && <div style={{ fontSize: 11, color: '#7D8FA9', fontStyle: 'italic', marginTop: 4 }}>📌 {alert.note}</div>}
                  </div>

                  {/* Threshold and status */}
                  <div style={{ textAlign: 'right', minWidth: 160 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1628', marginBottom: 4 }}>
                      ${fmt(live)}
                    </div>
                    <div style={{ fontSize: 12, color: change >= 0 ? '#059669' : '#DC2626', fontWeight: 700, marginBottom: 8 }}>
                      {change >= 0 ? '+' : ''}{fmt(change)}
                    </div>
                    <div style={{ fontSize: 11, color: '#7D8FA9' }}>
                      {alert.type === 'price_above' && `Threshold: $${fmt(alert.threshold)}`}
                      {alert.type === 'price_below' && `Threshold: $${fmt(alert.threshold)}`}
                      {alert.type === 'pct_change' && `Threshold: ${alert.threshold}%`}
                      {alert.type === 'volume_spike' && `2× average volume`}
                      {alert.type === 'news' && `News mentions`}
                    </div>
                    {isNear && <div style={{ fontSize: 10, color: '#F59E0B', fontWeight: 700, marginTop: 4 }}>⚡ NEAR THRESHOLD</div>}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                    <button onClick={() => toggleAlert(alert.id)}
                      style={{
                        padding: '6px 10px', borderRadius: 6, border: '1.5px solid #E2E8F2',
                        background: alert.active ? '#fff' : '#F8FAFD',
                        color: alert.active ? '#7D8FA9' : '#B0BCD0',
                        fontWeight: 600, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap'
                      }}>
                      {alert.active ? 'Pause' : 'Resume'}
                    </button>
                    {alert.triggered && (
                      <button onClick={() => dismissTrigger(alert.id)}
                        style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: '#EEF3FF', color: '#1B4FFF', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>
                        Dismiss
                      </button>
                    )}
                    <button onClick={() => deleteAlert(alert.id)}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1.5px solid #E2E8F2', background: '#fff', color: '#DC2626', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  )
}

'use client'
import { useEffect, useRef, useState, useMemo } from 'react'
import { fmt } from '@/lib/utils'
import { Card, Button, Badge, Input, Select, FieldLabel, ContextualAskBar } from '@/components/ui'

type NotifyChannel = 'email' | 'none'
interface NotifySettings {
  enabled: boolean
  channel: NotifyChannel
}

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
  notify?: NotifySettings
  lastNotifiedAt?: string
}

const DEFAULT_NOTIFY: NotifySettings = { enabled: true, channel: 'email' }
const NOTIFY_DEBOUNCE_MS = 60 * 60 * 1000
const STORAGE_KEY = 'finsyt.alerts.v2'

type AlertType = Alert['type']

const ALERT_TYPES: { value: AlertType; label: string; desc: string }[] = [
  { value: 'price_above',  label: 'Price Above',  desc: 'Alert when price crosses above threshold' },
  { value: 'price_below',  label: 'Price Below',  desc: 'Alert when price falls below threshold' },
  { value: 'pct_change',   label: '% Change',     desc: 'Alert on % move in a session' },
  { value: 'volume_spike', label: 'Volume Spike', desc: 'Alert when volume exceeds 2× average' },
  { value: 'news',         label: 'News Mention', desc: 'Alert when company appears in news' },
]

const DEMO_ALERTS: Alert[] = [
  { id: '1', symbol: 'NVDA', name: 'NVIDIA Corp.',     type: 'price_above',  threshold: 1000, currentVal: 924.8, triggered: false, active: true,  created: '2026-04-10' },
  { id: '2', symbol: 'AAPL', name: 'Apple Inc.',       type: 'price_below',  threshold: 170,  currentVal: 189.3, triggered: false, active: true,  created: '2026-04-08' },
  { id: '3', symbol: 'TSLA', name: 'Tesla Inc.',       type: 'pct_change',   threshold: 5,    currentVal: 3.2,   triggered: false, active: true,  created: '2026-04-11' },
  { id: '4', symbol: 'META', name: 'Meta Platforms',   type: 'price_above',  threshold: 500,  currentVal: 529.3, triggered: true,  active: true,  created: '2026-04-05', note: 'META broke $500' },
  { id: '5', symbol: 'MSFT', name: 'Microsoft',        type: 'volume_spike', threshold: 0,    currentVal: 0,     triggered: false, active: false, created: '2026-04-01' },
]

const typeLabel = (t: AlertType) => ALERT_TYPES.find(x => x.value === t)?.label || t

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>(DEMO_ALERTS)
  const [showNew, setShowNew] = useState(false)
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'triggered' | 'paused'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | AlertType>('all')
  const [search, setSearch] = useState('')
  const [quotes, setQuotes] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(DEMO_ALERTS[0]?.id || null)

  const [form, setForm] = useState({ symbol: '', type: 'price_above' as AlertType, threshold: '', note: '' })
  const [foundName, setFoundName] = useState('')
  const [notifyToast, setNotifyToast] = useState<string | null>(null)
  const triggerInFlight = useRef<Set<string>>(new Set())

  // Hydrate from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed?.alerts)) setAlerts(parsed.alerts)
      }
    } catch {}
  }, [])

  // Persist
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ alerts })) } catch {}
  }, [alerts])

  async function fireNotification(a: Alert) {
    const notify = a.notify || DEFAULT_NOTIFY
    if (!notify.enabled || notify.channel === 'none') return
    if (a.lastNotifiedAt && Date.now() - new Date(a.lastNotifiedAt).getTime() < NOTIFY_DEBOUNCE_MS) return
    if (triggerInFlight.current.has(a.id)) return
    triggerInFlight.current.add(a.id)
    try {
      const res = await fetch('/api/alert-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert: { id: a.id, symbol: a.symbol, name: a.name, type: a.type, threshold: a.threshold, currentVal: a.currentVal },
          channel: notify.channel,
        }),
      })
      const data: {
        ok?: boolean; delivered?: boolean; debounced?: boolean;
        transport?: 'resend' | 'log' | 'none'; reason?: string;
      } = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setNotifyToast(`Couldn't notify for ${a.symbol}${res.status === 401 ? ' — sign in required' : ''}`)
        setTimeout(() => setNotifyToast(null), 4000)
        return
      }
      // Only seed lastNotifiedAt on confirmed delivery or server-side debounce
      // (both mean the server considers this alert "handled" right now).
      if (data.delivered || data.debounced) {
        setAlerts(prev => prev.map(x => x.id === a.id ? { ...x, lastNotifiedAt: new Date().toISOString() } : x))
      }
      if (data.delivered) setNotifyToast(`Email sent for ${a.symbol}`)
      else if (data.debounced) { /* silent — already notified recently */ }
      else setNotifyToast(`${a.symbol} triggered — email not sent (${data.reason || 'check email setup'})`)
      setTimeout(() => setNotifyToast(null), 4000)
    } catch {
      // network/parse error — leave lastNotifiedAt untouched so we can retry
    } finally {
      triggerInFlight.current.delete(a.id)
    }
  }

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
      setAlerts(prev => {
        const next = prev.map(a => {
          const price = map[a.symbol]
          if (!price || !a.active) return a
          const nowTriggered =
            (a.type === 'price_above' && price >= a.threshold) ||
            (a.type === 'price_below' && price <= a.threshold)
          const flippedTrue = nowTriggered && !a.triggered
          if (flippedTrue) {
            // fire notification on next tick using the updated value
            queueMicrotask(() => fireNotification({ ...a, currentVal: price, triggered: true }))
          }
          return { ...a, currentVal: price, triggered: nowTriggered || a.triggered }
        })
        return next
      })
    } catch (e) { console.error('Price check failed:', e) } finally { setLoading(false) }
  }

  useEffect(() => { checkPrices() }, []) // eslint-disable-line
  useEffect(() => {
    if (!alerts.length) return
    const id = setInterval(checkPrices, 30_000)
    return () => clearInterval(id)
  }, [alerts])

  async function lookupSymbol(sym: string) {
    if (!sym) return
    try {
      const res = await fetch(`/api/quote?symbol=${sym.toUpperCase()}`)
      const data = await res.json()
      setFoundName(data.name || data.companyName || '')
      setForm(f => ({ ...f, threshold: String(Math.round((data.price || 0) * 100) / 100) }))
    } catch {}
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
      triggered: false, active: true,
      created: new Date().toISOString().slice(0, 10),
      note: form.note || undefined,
    }
    setAlerts(prev => [newAlert, ...prev])
    setSelectedId(newAlert.id)
    setForm({ symbol: '', type: 'price_above', threshold: '', note: '' })
    setFoundName('')
    setShowNew(false)
  }

  function toggleAlert(id: string) { setAlerts(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a)) }
  function updateNotify(id: string, patch: Partial<NotifySettings>) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, notify: { ...DEFAULT_NOTIFY, ...(a.notify || {}), ...patch } } : a))
  }
  function deleteAlert(id: string) {
    setAlerts(prev => prev.filter(a => a.id !== id))
    if (selectedId === id) setSelectedId(null)
  }
  function dismissTrigger(id: string) { setAlerts(prev => prev.map(a => a.id === id ? { ...a, triggered: false, lastNotifiedAt: undefined } : a)) }

  const filtered = useMemo(() => alerts.filter(a => {
    if (filterTab === 'active' && !(a.active && !a.triggered)) return false
    if (filterTab === 'triggered' && !a.triggered) return false
    if (filterTab === 'paused' && a.active) return false
    if (typeFilter !== 'all' && a.type !== typeFilter) return false
    if (search && !(a.symbol + ' ' + a.name).toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [alerts, filterTab, typeFilter, search])

  const selected = filtered.find(a => a.id === selectedId) || filtered[0] || null
  useEffect(() => { if (filtered.length && !filtered.find(a => a.id === selectedId)) setSelectedId(filtered[0].id) }, [filtered]) // eslint-disable-line

  const triggeredCount = alerts.filter(a => a.triggered).length
  const activeCount = alerts.filter(a => a.active && !a.triggered).length
  const pausedCount = alerts.filter(a => !a.active).length

  return (
    <div style={{ padding: '1.5rem 1.75rem', maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Alerts</h1>
          <p style={{ fontSize: 13, marginTop: 4, color: 'var(--text-secondary)' }}>Price, volume & news alerts · live checks every 30s</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastUpdate && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {loading ? 'Checking…' : `✓ ${lastUpdate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
            </span>
          )}
          <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>+ New Alert</Button>
        </div>
      </div>

      <ContextualAskBar
        context="Alerts"
        contextData={{ page: 'alerts', total: alerts.length, triggered: triggeredCount, paused: pausedCount }}
        chips={[
          { label: 'Suggest rules',         prompt: 'Suggest a tight set of price, volume and news alert rules tailored to my watchlist.' },
          { label: 'Earnings surprise',     prompt: 'Create alert templates that fire on earnings beats or misses outside one standard deviation of consensus.' },
          { label: 'Insider thresholds',    prompt: 'What insider transaction thresholds should I alert on for the names I cover?' },
          { label: 'News-volume spikes',    prompt: 'Set up alerts for unusual news volume relative to a 30-day baseline across my coverage.' },
        ]}
        placeholder="Ask Finsyt to design or tune alerts…"
        style={{ margin: '0 0 14px' }}
      />

      {notifyToast && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 200, padding: '10px 14px', borderRadius: 8, background: 'rgba(27,79,255,0.95)', color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
          🔔 {notifyToast}
        </div>
      )}

      {triggeredCount > 0 && (
        <Card padding={14} style={{ marginBottom: 14, background: 'var(--neg-dim)', border: '1px solid var(--neg)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 16 }}>🔔</span>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--neg)' }}>
            {triggeredCount} alert{triggeredCount > 1 ? 's' : ''} triggered — review on the right
          </div>
        </Card>
      )}

      {/* 3-column layout: filters / list / detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 380px', gap: 16, alignItems: 'start' }}>
        {/* LEFT: filters */}
        <Card padding={16} style={{ position: 'sticky', top: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 18 }}>
            {([
              ['all', 'All', alerts.length, 'var(--text-muted)'],
              ['active', 'Active', activeCount, 'var(--pos)'],
              ['triggered', 'Triggered', triggeredCount, 'var(--neg)'],
              ['paused', 'Paused', pausedCount, 'var(--text-muted)'],
            ] as const).map(([key, label, count, color]) => (
              <button key={key} onClick={() => setFilterTab(key)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: filterTab === key ? 'var(--accent-dim)' : 'transparent',
                color: filterTab === key ? 'var(--accent-text)' : 'var(--text-primary)',
                fontWeight: filterTab === key ? 700 : 500, fontSize: 13, fontFamily: 'inherit'
              }}>
                <span>{label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color }}>{count}</span>
              </button>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 18 }}>
            <button onClick={() => setTypeFilter('all')} style={typeBtn(typeFilter === 'all')}>All types</button>
            {ALERT_TYPES.map(t => (
              <button key={t.value} onClick={() => setTypeFilter(t.value)} style={typeBtn(typeFilter === t.value)}>{t.label}</button>
            ))}
          </div>

          <FieldLabel>Search</FieldLabel>
          <Input placeholder="Symbol or name" value={search} onChange={e => setSearch(e.target.value)} />
        </Card>

        {/* MIDDLE: list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.length === 0 ? (
            <Card padding={40} style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>No alerts match these filters</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Adjust filters or create a new alert.</div>
            </Card>
          ) : filtered.map(a => {
            const live = quotes[a.symbol] || a.currentVal
            const isSelected = selected?.id === a.id
            return (
              <button key={a.id} onClick={() => setSelectedId(a.id)} className="card" style={{
                padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                border: a.triggered ? '1.5px solid var(--neg)' : isSelected ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                background: isSelected ? 'var(--accent-dim)' : 'var(--bg-card)',
                opacity: !a.active ? 0.7 : 1,
                fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: a.triggered ? 'var(--neg)' : a.active ? 'var(--pos)' : 'var(--text-muted)' }} />
                <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', flexShrink: 0 }}>
                  {a.symbol.slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{a.symbol}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {typeLabel(a.type)} {a.type !== 'volume_spike' && a.type !== 'news' ? `· ${a.type === 'pct_change' ? a.threshold + '%' : '$' + fmt(a.threshold)}` : ''}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* RIGHT: detail drawer */}
        <Card padding={18} style={{ position: 'sticky', top: 16 }}>
          {!selected ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              Select an alert to see details
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--gradient-brand)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 14 }}>
                  {selected.symbol.slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{selected.symbol}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</div>
                </div>
                <Badge tone={selected.triggered ? 'neg' : selected.active ? 'pos' : 'neutral'}>
                  {selected.triggered ? 'Triggered' : selected.active ? 'Active' : 'Paused'}
                </Badge>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <Field label="Type" value={typeLabel(selected.type)} />
                <Field label="Threshold" value={selected.type === 'pct_change' ? `${selected.threshold}%` : selected.type === 'volume_spike' ? '2× avg' : selected.type === 'news' ? '—' : `$${fmt(selected.threshold)}`} />
                <Field label="Current" value={`$${fmt(quotes[selected.symbol] || selected.currentVal)}`} />
                <Field label="Created" value={selected.created} />
              </div>

              {selected.note && (
                <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.04)', fontSize: 12, color: 'var(--text-primary)', marginBottom: 14, fontStyle: 'italic' }}>
                  📌 {selected.note}
                </div>
              )}

              {(() => {
                const n = selected.notify || DEFAULT_NOTIFY
                return (
                  <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border)', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notification settings</div>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)' }}>
                        <input
                          type="checkbox"
                          checked={n.enabled}
                          onChange={e => updateNotify(selected.id, { enabled: e.target.checked })}
                          style={{ accentColor: '#1B4FFF' }}
                        />
                        {n.enabled ? 'On' : 'Off'}
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Channel</span>
                      <select
                        className="input"
                        value={n.channel}
                        disabled={!n.enabled}
                        onChange={e => updateNotify(selected.id, { channel: e.target.value as NotifyChannel })}
                        style={{ fontSize: 12, padding: '4px 6px' }}
                      >
                        <option value="email">Email</option>
                        <option value="none">In-app only</option>
                      </select>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                      Sent to your account email. Re-notifications debounced to once per hour per alert.
                      {selected.lastNotifiedAt && (
                        <> · Last sent {new Date(selected.lastNotifiedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</>
                      )}
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ marginTop: 8, width: '100%' }}
                      onClick={() => fireNotification({ ...selected, lastNotifiedAt: undefined })}
                      disabled={!n.enabled || n.channel === 'none'}
                    >
                      Send test notification
                    </button>
                  </div>
                )
              })()}

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Recent activity</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Activity when="just now" text={loading ? 'Checking price…' : `Checked at $${fmt(quotes[selected.symbol] || selected.currentVal)}`} />
                {selected.triggered && <Activity when="earlier" text="Threshold breached — alert fired" tone="warn" />}
                <Activity when={selected.created} text="Alert created" />
              </ul>

              <div style={{ display: 'flex', gap: 8 }}>
                {selected.triggered && (
                  <Button variant="primary" size="sm" style={{ flex: 1 }} onClick={() => dismissTrigger(selected.id)}>Dismiss</Button>
                )}
                <Button variant="secondary" size="sm" style={{ flex: 1 }} onClick={() => toggleAlert(selected.id)}>
                  {selected.active ? 'Pause' : 'Resume'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteAlert(selected.id)} style={{ color: 'var(--neg)' }}>Delete</Button>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* New alert modal */}
      {showNew && (
        <div onClick={() => setShowNew(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Card onClick={(e: React.MouseEvent) => e.stopPropagation()} padding={24} style={{ width: '100%', maxWidth: 460, border: '1.5px solid var(--accent)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Create New Alert</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowNew(false)} ariaLabel="Close">✕</Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <FieldLabel>Symbol</FieldLabel>
                <Input value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                  onBlur={() => form.symbol && lookupSymbol(form.symbol)} placeholder="AAPL"
                  style={{ textTransform: 'uppercase' }} />
                {foundName && <div style={{ fontSize: 11, color: 'var(--pos)', marginTop: 4 }}>✓ {foundName}</div>}
              </div>
              <div>
                <FieldLabel>Type</FieldLabel>
                <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as AlertType }))}>
                  {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <FieldLabel>Threshold</FieldLabel>
              <Input type="number" value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))} placeholder="150" />
            </div>
            <div>
              <FieldLabel>Note (optional)</FieldLabel>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Price target" />
            </div>

            <Button variant="primary" onClick={addAlert} disabled={!form.symbol || !form.threshold}
              style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}>
              Create Alert
            </Button>
          </Card>
        </div>
      )}
    </div>
  )
}

function typeBtn(active: boolean): React.CSSProperties {
  return {
    padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: active ? 'var(--accent-dim)' : 'transparent',
    color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
    fontWeight: active ? 700 : 500, fontSize: 12, fontFamily: 'inherit', textAlign: 'left'
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}
function Activity({ when, text, tone }: { when: string; text: string; tone?: 'warn' }) {
  return (
    <li style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
      <span style={{ color: tone === 'warn' ? 'var(--neg)' : 'var(--text-primary)' }}>{text}</span>
      <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>{when}</span>
    </li>
  )
}

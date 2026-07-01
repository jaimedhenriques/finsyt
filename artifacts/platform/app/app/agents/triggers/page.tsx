'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '@/lib/api-url'

// Event Triggers — /app/agents/triggers
// Manage event-based triggers (filing / price / news / watchlist) that
// automatically launch an agent run when conditions are met.

const TRIGGER_TYPES = ['filing', 'price', 'news', 'watchlist'] as const
type TriggerType = (typeof TRIGGER_TYPES)[number]

interface TriggerItem {
  id: string
  agentId: string
  triggerType: TriggerType
  config: Record<string, unknown>
  enabled: boolean
  lastFiredAt: string | null
  lastCheckedAt: string | null
  lastError: string | null
  fireCount: number
  createdAt: string
}

interface AgentItem { id: string; name: string; icon: string; category: string }

const TYPE_ICON: Record<TriggerType, string> = {
  filing: '📄',
  price: '📈',
  news: '📰',
  watchlist: '👁',
}
const TYPE_LABEL: Record<TriggerType, string> = {
  filing: 'SEC Filing',
  price: 'Price Alert',
  news: 'News Keyword',
  watchlist: 'Watchlist Move',
}

const TYPE_FIELDS: Record<TriggerType, { key: string; label: string; type: 'text' | 'number' | 'select'; options?: string[] }[]> = {
  filing: [
    { key: 'symbol', label: 'Ticker (optional)', type: 'text' },
    { key: 'formType', label: 'Form type (e.g. 10-K, 8-K)', type: 'text' },
    { key: 'cooldownHours', label: 'Cooldown (hours)', type: 'number' },
  ],
  price: [
    { key: 'symbol', label: 'Ticker', type: 'text' },
    { key: 'direction', label: 'Direction', type: 'select', options: ['above', 'below'] },
    { key: 'threshold', label: 'Price level ($)', type: 'number' },
    { key: 'cooldownHours', label: 'Cooldown (hours)', type: 'number' },
  ],
  news: [
    { key: 'symbol', label: 'Ticker (optional)', type: 'text' },
    { key: 'keywords', label: 'Keywords (comma-separated)', type: 'text' },
    { key: 'cooldownHours', label: 'Cooldown (hours)', type: 'number' },
  ],
  watchlist: [
    { key: 'symbols', label: 'Tickers (comma-separated)', type: 'text' },
    { key: 'thresholdPct', label: 'Move threshold (%)', type: 'number' },
    { key: 'cooldownHours', label: 'Cooldown (hours)', type: 'number' },
  ],
}

export default function EventTriggersPage() {
  const [agents, setAgents] = useState<AgentItem[]>([])
  const [triggersByAgent, setTriggersByAgent] = useState<Map<string, TriggerItem[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null) // agentId
  const [newType, setNewType] = useState<TriggerType>('filing')
  const [newConfig, setNewConfig] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [evalResult, setEvalResult] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const r = await fetch(apiUrl('/api/agents'), { cache: 'no-store' })
      if (!r.ok) { setErr('Failed to load agents'); return }
      const data = await r.json()
      const agentList: AgentItem[] = (data.agents || []).map((a: AgentItem) => ({ id: a.id, name: a.name, icon: a.icon, category: a.category }))
      setAgents(agentList)

      // Fetch triggers for each agent.
      const entries = await Promise.all(
        agentList.map(async (a) => {
          const tr = await fetch(apiUrl(`/api/agents/${a.id}/triggers`), { cache: 'no-store' })
          const td = await tr.json()
          return [a.id, td.triggers || []] as [string, TriggerItem[]]
        }),
      )
      setTriggersByAgent(new Map(entries))
    } catch (e) { setErr((e as Error).message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openCreate = (agentId: string) => {
    setCreating(agentId); setNewType('filing'); setNewConfig({})
  }
  const closeCreate = () => { setCreating(null); setNewConfig({}) }

  const buildConfig = (t: TriggerType, raw: Record<string, string>) => {
    const out: Record<string, unknown> = {}
    for (const f of TYPE_FIELDS[t]) {
      const v = raw[f.key]
      if (!v && f.key !== 'cooldownHours') continue
      if (f.type === 'number') { out[f.key] = Number(v) || (f.key === 'cooldownHours' ? 24 : 0) }
      else if (f.key === 'keywords') { out[f.key] = v.split(',').map((s) => s.trim()).filter(Boolean) }
      else if (f.key === 'symbols') { out[f.key] = v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) }
      else { out[f.key] = v }
    }
    return out
  }

  const createTrigger = async () => {
    if (!creating) return
    setSaving(true)
    try {
      const config = buildConfig(newType, newConfig)
      const r = await fetch(apiUrl(`/api/agents/${creating}/triggers`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ triggerType: newType, config }),
      })
      const data = await r.json()
      if (!r.ok) { setErr(data?.error || 'Failed to create trigger'); return }
      setTriggersByAgent((prev) => {
        const next = new Map(prev)
        const existing = next.get(creating) || []
        next.set(creating, [...existing, data.trigger])
        return next
      })
      closeCreate()
    } finally { setSaving(false) }
  }

  const toggleEnabled = async (agentId: string, triggerId: string, enabled: boolean) => {
    await fetch(apiUrl(`/api/agents/${agentId}/triggers`), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ triggerId, enabled }),
    })
    setTriggersByAgent((prev) => {
      const next = new Map(prev)
      const arr = (next.get(agentId) || []).map((t) => t.id === triggerId ? { ...t, enabled } : t)
      next.set(agentId, arr)
      return next
    })
  }

  const deleteTrigger = async (agentId: string, triggerId: string) => {
    if (!confirm('Delete this trigger?')) return
    await fetch(apiUrl(`/api/agents/${agentId}/triggers`), {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ triggerId }),
    })
    setTriggersByAgent((prev) => {
      const next = new Map(prev)
      next.set(agentId, (next.get(agentId) || []).filter((t) => t.id !== triggerId))
      return next
    })
  }

  const evaluateNow = async () => {
    setEvaluating(true); setEvalResult(null)
    try {
      const r = await fetch(apiUrl('/api/triggers/evaluate'), { method: 'POST' })
      const data = await r.json()
      if (!r.ok) { setEvalResult(`Error: ${data?.error || 'unknown'}`); return }
      setEvalResult(`Evaluated ${data.evaluated} trigger${data.evaluated !== 1 ? 's' : ''}, fired ${data.fired}`)
    } finally { setEvaluating(false) }
  }

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Loading triggers…</div>
  )

  const totalTriggers = agents.reduce((s, a) => s + (triggersByAgent.get(a.id) || []).length, 0)

  return (
    <div style={{ color: 'var(--text-primary)', maxWidth: 960, margin: '0 auto', padding: '24px 32px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 style={{ fontFamily: "'Inter Tight','Inter',sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, marginBottom: 6 }}>
            Event Triggers
          </h1>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Auto-launch agents when a filing, price move, news article, or watchlist event matches your conditions.
            {' '}{totalTriggers > 0 && <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{totalTriggers} trigger{totalTriggers !== 1 ? 's' : ''} configured.</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center' }}>
          {evalResult && <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginRight: 4 }}>{evalResult}</span>}
          <button onClick={evaluateNow} disabled={evaluating} style={{ ...primaryBtn, opacity: evaluating ? 0.7 : 1 }}>
            {evaluating ? '⟳ Evaluating…' : '▶ Evaluate now'}
          </button>
        </div>
      </div>

      {err && <div style={{ marginBottom: 18, padding: '12px 16px', borderRadius: 10, background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.3)', fontSize: 13, color: 'var(--neg)' }}>{err}</div>}

      {/* Type legend */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        {TRIGGER_TYPES.map((t) => (
          <span key={t} style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
            {TYPE_ICON[t]} {TYPE_LABEL[t]}
          </span>
        ))}
      </div>

      {/* Agents + their triggers */}
      {agents.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>
          No agents found.{' '}
          <Link href="/app/agents/new" style={{ color: 'var(--accent-text)' }}>Create an agent</Link> first.
        </div>
      )}

      {agents.map((agent) => {
        const triggers = triggersByAgent.get(agent.id) || []
        const isCreatingHere = creating === agent.id
        return (
          <div key={agent.id} style={{
            marginBottom: 18, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 14, overflow: 'hidden',
          }}>
            {/* Agent header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: (triggers.length || isCreatingHere) ? '1px solid var(--border)' : undefined }}>
              <span style={{ fontSize: 16 }}>{agent.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{agent.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{agent.category}</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>
                {triggers.length} trigger{triggers.length !== 1 ? 's' : ''}
              </span>
              <button onClick={() => isCreatingHere ? closeCreate() : openCreate(agent.id)} style={ghostBtn}>
                {isCreatingHere ? '✕ Cancel' : '+ Add trigger'}
              </button>
            </div>

            {/* Create trigger form */}
            {isCreatingHere && (
              <div style={{ padding: '16px 18px', background: 'rgba(27,79,255,0.05)', borderBottom: triggers.length ? '1px solid var(--border)' : undefined }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-text)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  New trigger for {agent.name}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {TRIGGER_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => { setNewType(t); setNewConfig({}) }}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                        background: newType === t ? 'var(--gradient-brand)' : 'rgba(255,255,255,0.06)',
                        border: newType === t ? 'none' : '1px solid var(--border)',
                        color: newType === t ? '#fff' : 'var(--text-secondary)',
                        boxShadow: newType === t ? '0 2px 8px var(--accent-dim)' : 'none',
                      }}
                    >{TYPE_ICON[t]} {TYPE_LABEL[t]}</button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 14 }}>
                  {TYPE_FIELDS[newType].map((f) => (
                    <div key={f.key}>
                      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</label>
                      {f.type === 'select' ? (
                        <select
                          value={newConfig[f.key] ?? ''}
                          onChange={(e) => setNewConfig((prev) => ({ ...prev, [f.key]: e.target.value }))}
                          style={{ ...inputStyle }}
                        >
                          <option value="">Select…</option>
                          {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          type={f.type}
                          placeholder={f.key === 'cooldownHours' ? '24' : undefined}
                          value={newConfig[f.key] ?? ''}
                          onChange={(e) => setNewConfig((prev) => ({ ...prev, [f.key]: e.target.value }))}
                          style={{ ...inputStyle }}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={createTrigger} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving…' : '✔ Create trigger'}
                </button>
              </div>
            )}

            {/* Trigger list */}
            {triggers.map((t) => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 18px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                opacity: t.enabled ? 1 : 0.55,
              }}>
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{TYPE_ICON[t.triggerType]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{TYPE_LABEL[t.triggerType]}</span>
                    {!t.enabled && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.07)', color: 'var(--text-muted)', fontWeight: 700 }}>PAUSED</span>}
                    {t.fireCount > 0 && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(52,211,153,0.12)', color: 'var(--pos)', fontWeight: 700 }}>fired {t.fireCount}×</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {Object.entries(t.config).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)).map(([k, v]) => (
                      <span key={k} style={{ marginRight: 10 }}><strong>{k}:</strong> {Array.isArray(v) ? v.join(', ') : String(v)}</span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                    {t.lastFiredAt && <span>Last fired: {new Date(t.lastFiredAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                    {t.lastError && <span style={{ color: 'var(--neg)' }}>Error: {t.lastError.slice(0, 80)}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center', marginTop: 2 }}>
                  <button
                    onClick={() => toggleEnabled(agent.id, t.id, !t.enabled)}
                    style={{
                      padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      background: t.enabled ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.06)',
                      border: t.enabled ? '1px solid rgba(52,211,153,0.3)' : '1px solid var(--border)',
                      color: t.enabled ? 'var(--pos)' : 'var(--text-muted)',
                    }}
                  >{t.enabled ? '⏸ Pause' : '▶ Enable'}</button>
                  <button
                    onClick={() => deleteTrigger(agent.id, t.id)}
                    style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.28)', color: 'var(--neg)' }}
                  >Delete</button>
                </div>
              </div>
            ))}

            {triggers.length === 0 && !isCreatingHere && (
              <div style={{ padding: '16px 18px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                No triggers yet — click <strong>+ Add trigger</strong> to auto-launch this agent on events.
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 7,
  background: 'var(--bg-base)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', fontSize: 12.5, fontFamily: 'inherit',
}
const ghostBtn: React.CSSProperties = {
  padding: '7px 13px', borderRadius: 8, background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--border)', color: 'var(--text-secondary)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const primaryBtn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 9, background: 'var(--gradient-brand)',
  border: 'none', color: '#fff', fontSize: 12.5, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 12px var(--accent-dim)',
}

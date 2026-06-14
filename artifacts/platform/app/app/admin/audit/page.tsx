'use client'
import { useEffect, useState, useCallback } from 'react'

// Browser hits the api-server artifact directly when fetching '/api/*' (it
// owns that path prefix), so we explicitly target the platform's basePath
// to land on our authenticated Next.js route handlers.
const API = '/platform/api'

const C = {
  bg: '#060D18', card: '#0C1624', border: 'rgba(255,255,255,0.07)',
  p: '#E2EEFF', s: '#7B96B8', m: 'rgba(255,255,255,0.4)',
  acc: '#1B4FFF', accT: '#93B4FF', accD: 'rgba(27,79,255,0.18)',
  pos: '#34D399', neg: '#F87171', amb: '#FBBF24',
}

interface AuditEvent {
  id: string
  occurred_at: string
  org_id: string
  actor_id: string | null
  actor_type: string
  action: string
  resource_type: string | null
  resource_id: string | null
  ip: string | null
  user_agent: string | null
  metadata: Record<string, unknown> | null
}

interface RetentionSettings {
  audit_log_days: number
  transient_log_days: number
  abandoned_chat_days: number
  updated_at?: string | null
}

const ACTION_OPTIONS = [
  '', 'auth.login.success', 'auth.login.failed', 'auth.logout', 'auth.password.reset',
  'mfa.enabled', 'mfa.disabled', 'mfa.challenge.failed',
  'role.changed', 'membership.added', 'membership.removed',
  'sso.config.updated', 'sso.config.deleted',
  'data.export.requested', 'data.export.completed',
  'account.delete.requested', 'account.delete.completed',
  'retention.settings.updated', 'retention.purge.ran',
]

function colourForAction(a: string): string {
  if (a.startsWith('auth.login.failed') || a.includes('failed') || a.startsWith('account.delete')) return C.neg
  if (a.startsWith('auth.login.success') || a.startsWith('mfa.enabled')) return C.pos
  if (a.startsWith('retention') || a.startsWith('data.export')) return C.amb
  return C.accT
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState('')
  const [actorId, setActorId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [retention, setRetention] = useState<RetentionSettings | null>(null)
  const [savingRetention, setSavingRetention] = useState(false)
  const [purging, setPurging] = useState(false)
  const [retentionMsg, setRetentionMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (action) params.set('action', action)
      if (actorId) params.set('actorId', actorId)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      params.set('limit', '200')
      const r = await fetch(`${API}/admin/audit?${params}`, { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setEvents(data.events || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [action, actorId, from, to])

  const loadRetention = useCallback(async () => {
    try {
      const r = await fetch(`${API}/admin/retention`, { cache: 'no-store' })
      if (!r.ok) return
      const data = await r.json()
      setRetention(data.settings)
    } catch {}
  }, [])

  useEffect(() => { load(); loadRetention() }, [load, loadRetention])

  function exportCsv() {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    window.location.href = `${API}/admin/audit/export?${params}`
  }

  async function saveRetention() {
    if (!retention) return
    setSavingRetention(true); setRetentionMsg(null)
    try {
      const r = await fetch(`${API}/admin/retention`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          auditLogDays: retention.audit_log_days,
          transientLogDays: retention.transient_log_days,
          abandonedChatDays: retention.abandoned_chat_days,
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setRetentionMsg('Saved')
    } catch (e: any) {
      setRetentionMsg(e?.message || 'Save failed')
    } finally {
      setSavingRetention(false)
      setTimeout(() => setRetentionMsg(null), 3000)
    }
  }

  async function runPurge() {
    if (!confirm('Run retention purge now? Audit events older than the configured window will be permanently deleted.')) return
    setPurging(true); setRetentionMsg(null)
    try {
      const r = await fetch(`${API}/admin/retention/purge`, { method: 'POST' })
      const d = await r.json()
      setRetentionMsg(r.ok ? `Removed ${d.auditEventsRemoved ?? 0} rows` : (d.error || 'Purge failed'))
      load()
    } catch (e: any) {
      setRetentionMsg(e?.message || 'Purge failed')
    } finally {
      setPurging(false)
      setTimeout(() => setRetentionMsg(null), 4000)
    }
  }

  return (
    <div style={{ padding: '1.75rem', maxWidth: 1400, margin: '0 auto', color: C.p }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>Audit Log</h1>
        <p style={{ fontSize: 13, color: C.s }}>Append-only record of security-relevant events for your organisation. Required for SOC 2 and GDPR Art. 30.</p>
      </div>

      {/* Retention settings card */}
      {retention && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Retention Policy</div>
              <div style={{ fontSize: 11, color: C.s, marginTop: 2 }}>
                A nightly job purges audit events older than the configured window. Set 0 to retain forever.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {retentionMsg && <span style={{ fontSize: 11, color: C.amb }}>{retentionMsg}</span>}
              <button onClick={runPurge} disabled={purging}
                style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.s, fontSize: 11, fontWeight: 600, cursor: purging ? 'not-allowed' : 'pointer' }}>
                {purging ? 'Purging…' : 'Run purge now'}
              </button>
              <button onClick={saveRetention} disabled={savingRetention}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: C.acc, color: '#fff', fontSize: 11, fontWeight: 700, cursor: savingRetention ? 'not-allowed' : 'pointer' }}>
                {savingRetention ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {[
              { label: 'Audit log retention (days)',     key: 'audit_log_days' as const },
              { label: 'Transient logs retention (days)',key: 'transient_log_days' as const },
              { label: 'Abandoned chats retention (days)',key: 'abandoned_chat_days' as const },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: 10, color: C.m, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{f.label}</label>
                <input
                  type="number" min={0} max={3650}
                  value={retention[f.key]}
                  onChange={e => setRetention({ ...retention, [f.key]: Number(e.target.value) })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.p, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1fr 1fr auto auto', gap: 10, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: C.m, fontWeight: 700, textTransform: 'uppercase', marginBottom: 5 }}>Action</label>
            <select value={action} onChange={e => setAction(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.p, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}>
              {ACTION_OPTIONS.map(a => <option key={a} value={a}>{a || '— Any action —'}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: C.m, fontWeight: 700, textTransform: 'uppercase', marginBottom: 5 }}>Actor ID</label>
            <input value={actorId} onChange={e => setActorId(e.target.value)} placeholder="user_..." 
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.p, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: C.m, fontWeight: 700, textTransform: 'uppercase', marginBottom: 5 }}>From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.p, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: C.m, fontWeight: 700, textTransform: 'uppercase', marginBottom: 5 }}>To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.p, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
          </div>
          <button onClick={load} disabled={loading}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: C.acc, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'Loading…' : 'Apply'}
          </button>
          <button onClick={exportCsv}
            style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.s, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: C.s }}>{loading ? 'Loading…' : `${events.length} events`}</span>
          {error && <span style={{ fontSize: 12, color: C.neg }}>{error}</span>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                {['Time', 'Action', 'Actor', 'Resource', 'IP', 'Metadata'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, color: C.m, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && !loading && (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: C.s }}>No events match these filters.</td></tr>
              )}
              {events.map(ev => (
                <tr key={ev.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: C.s, fontFamily: 'monospace' }}>
                    {new Date(ev.occurred_at).toISOString().replace('T', ' ').slice(0, 19)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: colourForAction(ev.action) }}>
                      {ev.action}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: C.p }}>
                    {ev.actor_id || <span style={{ color: C.m }}>system</span>}
                    <div style={{ fontSize: 10, color: C.m }}>{ev.actor_type}</div>
                  </td>
                  <td style={{ padding: '10px 14px', color: C.s, fontSize: 11 }}>
                    {ev.resource_type ? `${ev.resource_type}${ev.resource_id ? ' · ' + ev.resource_id : ''}` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: C.s, fontFamily: 'monospace', fontSize: 11 }}>{ev.ip || '—'}</td>
                  <td style={{ padding: '10px 14px', color: C.s, fontSize: 11, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ev.metadata ? JSON.stringify(ev.metadata) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

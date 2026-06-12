'use client'
/**
 * "From your connections" panel.
 *
 * Lists the workspace's active REST + first-party connections and the
 * operations relevant to the surrounding context (a company page, the
 * earnings calendar, etc.). The user clicks "Run" to call the operation
 * through the unified executor — same path as the public
 * `/api/v1/connectors/[slug]/[op]` surface — and the JSON response is
 * rendered inline.
 *
 * This is the explicit "Your data" surface the Connector Hub spec calls
 * for: once an admin has wired e.g. an internal CRM, pricing API, or
 * earnings-events feed, every analyst sees the same operations right
 * next to standard FMP data, in the right place.
 *
 * The `mode` prop selects which operations are surfaced and how their
 * parameters are auto-filled from page context:
 *   - `company` — ops with a `symbol`/`ticker`/`cik` param, prefilled
 *     with the current ticker (default).
 *   - `earnings` — ops whose name/description/path mentions earnings,
 *     EPS, calendar, or transcripts; no auto-fill (the user can run
 *     them as-is or edit later).
 */
import { useEffect, useMemo, useState } from 'react'

const API = '/platform/api/connectors'

interface Connection {
  id: string
  kind: string
  status: string
  displayName: string
  category: string
}

interface Operation {
  id: string
  name: string
  description: string
  method: string
  path: string
  enabled: boolean
  paramSchema: Record<string, { type?: string; required?: boolean; description?: string }> | Record<string, unknown>
}

const SYMBOL_PARAM_KEYS = new Set(['symbol', 'ticker', 'tickers', 'symbols', 'cik'])
const EARNINGS_KEYWORDS = ['earnings', 'eps', 'transcript', 'estimate', 'guidance', 'calendar']

function paramKeys(schema: Operation['paramSchema'] | undefined): string[] {
  if (!schema || typeof schema !== 'object') return []
  return Object.keys(schema as Record<string, unknown>)
}

function matchesCompany(op: Operation): string | null {
  const keys = paramKeys(op.paramSchema)
  for (const k of keys) {
    if (SYMBOL_PARAM_KEYS.has(k.toLowerCase())) return k
  }
  // Path templates like /quote/{symbol} also count.
  const m = op.path.match(/\{([a-zA-Z0-9_]+)\}/g)
  if (m) {
    for (const tok of m) {
      const k = tok.slice(1, -1)
      if (SYMBOL_PARAM_KEYS.has(k.toLowerCase())) return k
    }
  }
  return null
}

function matchesEarnings(op: Operation): boolean {
  const hay = `${op.name} ${op.description || ''} ${op.path}`.toLowerCase()
  return EARNINGS_KEYWORDS.some((k) => hay.includes(k))
}

interface RunState {
  loading: boolean
  ok?: boolean
  status?: number
  error?: string
  data?: unknown
  ranAt?: string
}

export interface ConnectorDataPanelProps {
  /** Required when `mode==='company'`; ignored otherwise. */
  symbol?: string
  /** Which operations to surface. Default `'company'`. */
  mode?: 'company' | 'earnings'
  /** Optional override for the panel heading. */
  title?: string
}

export default function ConnectorDataPanel({ symbol, mode = 'company', title }: ConnectorDataPanelProps) {
  const [conns, setConns] = useState<Connection[]>([])
  const [opsByConn, setOpsByConn] = useState<Record<string, Operation[]>>({})
  const [runs, setRuns] = useState<Record<string, RunState>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const r = await fetch(`${API}/connections`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const body = await r.json()
        const list: Connection[] = Array.isArray(body.connections) ? body.connections : []
        const active = list.filter((c) => c.status === 'active' && c.kind !== 'mcp')
        if (cancelled) return
        setConns(active)
        // Load ops for each active connection in parallel.
        const opsEntries = await Promise.all(active.map(async (c) => {
          try {
            const or = await fetch(`${API}/connections/${c.id}/operations`)
            if (!or.ok) return [c.id, [] as Operation[]] as const
            const ob = await or.json()
            return [c.id, (Array.isArray(ob.operations) ? ob.operations : []) as Operation[]] as const
          } catch { return [c.id, [] as Operation[]] as const }
        }))
        if (cancelled) return
        const map: Record<string, Operation[]> = {}
        for (const [id, ops] of opsEntries) map[id] = ops
        setOpsByConn(map)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const matches = useMemo(() => {
    const out: Array<{ conn: Connection; op: Operation; symParam: string | null }> = []
    for (const c of conns) {
      for (const op of opsByConn[c.id] || []) {
        if (!op.enabled) continue
        if (mode === 'company') {
          const symParam = matchesCompany(op)
          if (symParam) out.push({ conn: c, op, symParam })
        } else {
          if (matchesEarnings(op)) out.push({ conn: c, op, symParam: null })
        }
      }
    }
    return out
  }, [conns, opsByConn, mode])

  async function runOp(conn: Connection, op: Operation, symParam: string | null) {
    const k = `${conn.id}:${op.id}`
    setRuns((s) => ({ ...s, [k]: { loading: true } }))
    try {
      const params: Record<string, string> = symParam && symbol ? { [symParam]: symbol } : {}
      // We always go through the workspace-internal exec endpoint so the
      // call uses the user's Clerk session (no per-user API keys needed).
      // The same executor backs the public `/api/v1/...` path.
      const res = await fetch(`${API}/connections/${conn.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: op.name, params }),
      })
      const body = await res.json().catch(() => ({}))
      setRuns((s) => ({
        ...s,
        [k]: {
          loading: false,
          ok: res.ok,
          status: res.status,
          error: res.ok ? undefined : (body?.error || `HTTP ${res.status}`),
          data: res.ok ? body : undefined,
          ranAt: new Date().toISOString(),
        },
      }))
    } catch (e) {
      setRuns((s) => ({ ...s, [k]: { loading: false, ok: false, error: (e as Error).message } }))
    }
  }

  if (loading) {
    return <div className="card" style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)' }}>Loading your connections…</div>
  }
  if (error) {
    return <div className="card" style={{ padding: 16, fontSize: 13, color: '#dc2626' }}>Could not load connections: {error}</div>
  }
  if (conns.length === 0) {
    return (
      <div className="card" style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
        No active connections yet.{' '}
        <a href="/platform/app/connectors" className="link">Connect an API or MCP server →</a>
      </div>
    )
  }
  if (matches.length === 0) {
    const hint = mode === 'company'
      ? <>none expose a company-scoped operation (one with a <code>symbol</code>, <code>ticker</code>, or <code>cik</code> parameter).</>
      : <>none expose an earnings-related operation (matched on <code>earnings</code>, <code>eps</code>, <code>transcript</code>, <code>estimate</code>, <code>guidance</code>, or <code>calendar</code>).</>
    return (
      <div className="card" style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
        You have {conns.length} active connection{conns.length === 1 ? '' : 's'} but {hint}{' '}
        <a href="/platform/app/connectors" className="link">Manage connections →</a>
      </div>
    )
  }
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{title || 'From your connections'}</h3>
        <a href="/platform/app/connectors" className="link" style={{ fontSize: 12 }}>Manage →</a>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {matches.map(({ conn, op, symParam }) => {
          const k = `${conn.id}:${op.id}`
          const r = runs[k]
          return (
            <div
              key={k}
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                padding: 12,
                background: 'var(--bg-secondary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 700 }}>{conn.displayName}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>·</span>
                <span style={{
                  fontFamily: 'ui-monospace, monospace', fontSize: 11,
                  background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4,
                }}>{op.method}</span>
                <span style={{ fontWeight: 600 }}>{op.name}</span>
                <span style={{ color: 'var(--text-tertiary)', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                  {symParam && symbol ? op.path.replace(`{${symParam}}`, symbol) : op.path}
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 10px' }}
                  disabled={r?.loading}
                  onClick={() => runOp(conn, op, symParam)}
                >
                  {r?.loading ? 'Running…' : 'Run'}
                </button>
              </div>
              {op.description && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{op.description}</div>
              )}
              {r && !r.loading && (
                <div style={{ marginTop: 8 }}>
                  {r.ok ? (
                    <details>
                      <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)' }}>
                        OK · HTTP {r.status} · {r.ranAt && new Date(r.ranAt).toLocaleTimeString()}
                      </summary>
                      <pre style={{
                        marginTop: 6,
                        maxHeight: 240,
                        overflow: 'auto',
                        background: 'var(--bg-primary)',
                        padding: 8,
                        borderRadius: 4,
                        fontSize: 11,
                        whiteSpace: 'pre-wrap',
                      }}>
                        {JSON.stringify(r.data, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    <div style={{ fontSize: 11, color: '#dc2626' }}>Error: {r.error}</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

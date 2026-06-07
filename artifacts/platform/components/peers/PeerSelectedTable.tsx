'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// ── Institutional "Selected Peers" table ───────────────────────────────────
// Mirrors the layout used by Capital IQ / Bloomberg PEER tabs: anchor row at
// the top, member rows below, summary statistics (Max / Min / Mean / Median)
// at the bottom, and an inline "+ Add Peer" link the owner can use to mutate
// the underlying peer set without leaving the page. Uses /api/peers/compare
// for the actual data — that route flags synthesised cells with `demo: true`
// so we render the amber "demo" badge in the column header where appropriate.

export type PeerCompareCell = { value: number | null; display: string; demo?: boolean }
export type PeerCompareRow = { symbol: string; name: string; ok: boolean; cells: Record<string, PeerCompareCell> }
export type PeerCompareMetric = { key: string; label: string; demo: boolean }
export type PeerCompareResponse = {
  setId: string | null
  setName: string | null
  subject: string | null
  symbols: string[]
  metrics: string[]
  metricsMeta: PeerCompareMetric[]
  rows: PeerCompareRow[]
}

type Props = {
  /** When provided, loads the saved peer set; otherwise uses `symbols`. */
  setId?: string | null
  /** Anchor symbol pinned at the top of the table. */
  subject?: string | null
  /** Explicit symbol list (used when no setId is supplied). */
  symbols?: string[]
  /** Subset of metric keys to render. Defaults to the full institutional view. */
  metrics?: string[]
  /** Show the "+ Add Peer" inline editor — only enabled when the set is owned. */
  editable?: boolean
  /** Owning peer-set id used for member POST/DELETE. */
  ownedSetId?: string | null
  /** Title rendered above the table. */
  title?: string
  /** Subtitle line under the title. */
  subtitle?: string
  /** CSV export filename (without extension). */
  csvBaseName?: string
}

const DEFAULT_METRICS = [
  'marketCap', 'pe', 'forwardPe', 'evEbitda', 'evEbitdaNtm',
  'ps', 'grossMargin', 'netMargin', 'roe', 'debtEquity', 'dividendYield', 'optionsItmPct',
]

function summary(rows: PeerCompareRow[], key: string) {
  const vals = rows.map((r) => r.cells[key]?.value).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (vals.length === 0) return { max: null, min: null, mean: null, median: null }
  const sorted = [...vals].sort((a, b) => a - b)
  const sum = vals.reduce((a, b) => a + b, 0)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  return { max: sorted[sorted.length - 1], min: sorted[0], mean: sum / vals.length, median }
}

function fmtSummary(key: string, v: number | null): string {
  if (v == null) return '—'
  if (key === 'marketCap') {
    if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'
    if (v >= 1e9)  return '$' + (v / 1e9).toFixed(1)  + 'B'
    if (v >= 1e6)  return '$' + (v / 1e6).toFixed(1)  + 'M'
    return '$' + Math.round(v).toLocaleString()
  }
  if (key === 'price')         return '$' + v.toFixed(2)
  if (key === 'changePct')     return v.toFixed(2) + '%'
  if (key === 'grossMargin' || key === 'netMargin' || key === 'roe' || key === 'dividendYield' || key === 'optionsItmPct') {
    return v.toFixed(1) + '%'
  }
  if (key === 'debtEquity')    return v.toFixed(2)
  return v.toFixed(1) + 'x'
}

function toCsv(metrics: PeerCompareMetric[], rows: PeerCompareRow[]) {
  const head = ['Symbol', 'Name', ...metrics.map((m) => m.label)].map(csvCell).join(',')
  const lines = rows.map((r) =>
    [r.symbol, r.name, ...metrics.map((m) => r.cells[m.key]?.display ?? '')].map(csvCell).join(','),
  )
  return [head, ...lines].join('\n')
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function downloadCsv(name: string, body: string) {
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name + '.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function PeerSelectedTable({
  setId, subject, symbols, metrics: metricsProp,
  editable, ownedSetId,
  title = 'Selected Peers', subtitle, csvBaseName = 'peers',
}: Props) {
  const [data, setData] = useState<PeerCompareResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [addInput, setAddInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const metricKeys = useMemo(() => (metricsProp && metricsProp.length > 0 ? metricsProp : DEFAULT_METRICS), [metricsProp?.join(',')])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    const body: Record<string, unknown> = { metrics: metricKeys.join(',') }
    if (setId) body.setId = setId
    if (subject) body.subject = subject
    if (symbols && symbols.length > 0) body.symbols = symbols.join(',')

    fetch(`${BASE}/api/peers/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({ error: 'Failed' }))).error || 'Failed')
        return r.json() as Promise<PeerCompareResponse>
      })
      .then((j) => { if (!cancelled) setData(j) })
      .catch((e) => { if (!cancelled) setErr(String(e?.message || e)) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [setId, subject, symbols?.join(','), metricKeys.join(','), reloadKey])

  async function handleAddPeer(e?: React.FormEvent) {
    e?.preventDefault()
    if (!ownedSetId) return
    const sym = addInput.trim().toUpperCase()
    if (!sym) return
    setAdding(true)
    try {
      const r = await fetch(`${BASE}/api/peers/sets/${ownedSetId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym }),
      })
      if (r.ok) {
        setAddInput('')
        setReloadKey((k) => k + 1)
      }
    } finally {
      setAdding(false)
    }
  }

  async function handleRemovePeer(sym: string) {
    if (!ownedSetId) return
    if (!confirm(`Remove ${sym} from this peer set?`)) return
    const r = await fetch(`${BASE}/api/peers/sets/${ownedSetId}/members/${encodeURIComponent(sym)}`, { method: 'DELETE' })
    if (r.ok || r.status === 204) setReloadKey((k) => k + 1)
  }

  const metricsMeta = data?.metricsMeta ?? metricKeys.map((k) => ({ key: k, label: k, demo: false }))
  const rows = data?.rows ?? []

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {data && data.metricsMeta.some((m) => m.demo) && (
            <span title="Highlighted columns use deterministic synthetic numbers — wire your paid feed to replace."
              style={{ padding: '3px 8px', borderRadius: 999, background: 'rgba(245, 158, 11, 0.12)', color: '#b45309', fontSize: 10, fontWeight: 700 }}>
              Demo cells
            </span>
          )}
          <button
            onClick={() => data && downloadCsv(csvBaseName, toCsv(metricsMeta, rows))}
            disabled={!data || rows.length === 0}
            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: data ? 'pointer' : 'not-allowed' }}>
            ⬇ CSV
          </button>
        </div>
      </div>

      <div style={{ overflow: 'auto' }}>
        <table className="data-table" style={{ width: '100%', minWidth: 880 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 220, textAlign: 'left' }}>Company</th>
              {metricsMeta.map((m) => (
                <th key={m.key} className="right" style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                  <div>{m.label}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: m.demo ? '#b45309' : 'var(--text-muted)', marginTop: 2 }}>
                    {m.demo ? 'NTM · demo' : 'LTM'}
                  </div>
                </th>
              ))}
              {editable && <th style={{ width: 36 }} />}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 4 }).map((_, i) => (
              <tr key={'sk' + i}>
                <td><span className="skeleton" style={{ width: 160, height: 12, display: 'inline-block' }} /></td>
                {metricsMeta.map((m) => (
                  <td key={m.key} className="right"><span className="skeleton" style={{ width: 50, height: 12, display: 'inline-block' }} /></td>
                ))}
                {editable && <td />}
              </tr>
            ))}
            {!loading && rows.map((r, i) => {
              const isAnchor = i === 0 && (data?.subject ? r.symbol === data.subject : false)
              return (
                <tr key={r.symbol} style={isAnchor ? { background: 'rgba(99, 102, 241, 0.06)' } : undefined}>
                  <td style={{ fontWeight: isAnchor ? 800 : 600 }}>
                    <Link href={`${BASE}/app/company/${r.symbol}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                      {r.name} <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>({r.symbol})</span>
                    </Link>
                  </td>
                  {metricsMeta.map((m) => (
                    <td key={m.key} className="right" style={{ color: r.cells[m.key]?.demo ? '#b45309' : 'var(--text-secondary)', fontWeight: isAnchor ? 700 : 500 }}>
                      {r.cells[m.key]?.display ?? '—'}
                    </td>
                  ))}
                  {editable && (
                    <td className="right">
                      {!isAnchor && ownedSetId && (
                        <button onClick={() => handleRemovePeer(r.symbol)} title={`Remove ${r.symbol}`}
                          aria-label={`Remove ${r.symbol}`}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, fontSize: 14 }}>×</button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
            {!loading && err && (
              <tr><td colSpan={metricsMeta.length + 1 + (editable ? 1 : 0)} style={{ color: '#b91c1c', fontStyle: 'italic' }}>{err}</td></tr>
            )}
            {!loading && !err && rows.length === 0 && (
              <tr><td colSpan={metricsMeta.length + 1 + (editable ? 1 : 0)} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No peers in this set yet.</td></tr>
            )}
            {editable && ownedSetId && (
              <tr>
                <td colSpan={metricsMeta.length + 2}>
                  <form onSubmit={handleAddPeer} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                    <input
                      value={addInput}
                      onChange={(e) => setAddInput(e.target.value.toUpperCase())}
                      placeholder="+ Add peer (e.g. NET)"
                      aria-label="Add peer ticker"
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, width: 200, outline: 'none' }}
                    />
                    <button type="submit" disabled={!addInput.trim() || adding}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: addInput.trim() ? 'pointer' : 'not-allowed', opacity: addInput.trim() ? 1 : 0.5 }}>
                      {adding ? 'Adding…' : 'Add'}
                    </button>
                  </form>
                </td>
              </tr>
            )}
          </tbody>
          {!loading && rows.length > 1 && (
            <tfoot>
              {(['max', 'min', 'mean', 'median'] as const).map((agg) => (
                <tr key={agg} style={{ background: 'var(--bg-soft, rgba(0,0,0,0.02))' }}>
                  <td style={{ fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{agg}</td>
                  {metricsMeta.map((m) => {
                    const s = summary(rows, m.key)
                    return <td key={m.key} className="right" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{fmtSummary(m.key, s[agg])}</td>
                  })}
                  {editable && <td />}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

'use client'
import type { CompsResult } from './types'

interface Props {
  comps: CompsResult
  onExportCsv?: (rows: string[][]) => void
}

function fmtSummary(key: string, v: number | null): string {
  if (v == null) return '—'
  if (key === 'marketCap') {
    if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'
    if (v >= 1e9)  return '$' + (v / 1e9).toFixed(1) + 'B'
    if (v >= 1e6)  return '$' + (v / 1e6).toFixed(1) + 'M'
    return '$' + Math.round(v).toLocaleString()
  }
  if (key === 'price') return '$' + v.toFixed(2)
  if (['grossMargin','netMargin','roe','dividendYield','optionsItmPct','changePct'].includes(key)) return v.toFixed(1) + '%'
  if (key === 'debtEquity') return v.toFixed(2)
  return v.toFixed(1) + 'x'
}

function summary(rows: CompsResult['rows'] = [], key: string) {
  const vals = rows.map(r => r.cells[key]?.value).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!vals.length) return { max: null, min: null, mean: null, median: null }
  const sorted = [...vals].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  return { max: sorted[sorted.length - 1], min: sorted[0], mean: vals.reduce((a, b) => a + b, 0) / vals.length, median }
}

function toCsvRows(metrics: CompsResult['metricsMeta'], rows: CompsResult['rows']): string[][] {
  const header = ['Symbol', 'Name', ...(metrics || []).map(m => m.label + (m.demo ? ' [demo]' : '')), 'Data Source']
  const dataRows = (rows || []).map(r => [
    r.symbol, r.name,
    ...(metrics || []).map(m => r.cells[m.key]?.display ?? ''),
    r.source ?? 'fmp',
  ])
  return [header, ...dataRows]
}

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

export default function CompsPanel({ comps, onExportCsv }: Props) {
  if (comps.error) {
    return (
      <div style={{ padding: 24, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 13 }}>
        <span style={{ color: 'var(--neg)', fontWeight: 700 }}>Comps error: </span>{comps.error}
      </div>
    )
  }
  if (comps.skipped) {
    return (
      <div style={{ padding: 24, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13 }}>
        No peer symbols — comps skipped.
      </div>
    )
  }

  const metrics = comps.metricsMeta || []
  const rows = comps.rows || []
  const subject = comps.subject

  const hasDemo = metrics.some(m => m.demo)

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Trading Comps</div>
          {subject && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Subject: {subject} · {rows.length} companies</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {hasDemo && (
            <span title="Some columns use deterministic demo numbers" style={{ padding: '3px 8px', borderRadius: 999, background: 'rgba(245,158,11,0.12)', color: '#b45309', fontSize: 10, fontWeight: 700 }}>
              Demo cells
            </span>
          )}
          <button
            onClick={() => onExportCsv?.(toCsvRows(metrics, rows))}
            disabled={rows.length === 0}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            ⬇ Export Comps CSV
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ width: '100%', minWidth: 800 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', minWidth: 180 }}>Company</th>
              {metrics.map(m => (
                <th key={m.key} className="right" style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                  <div>{m.label}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: m.demo ? '#b45309' : 'var(--text-muted)', marginTop: 2 }}>
                    {m.ntm ? (m.demo ? 'NTM · demo' : 'NTM · FMP') : 'LTM · FMP'}
                  </div>
                </th>
              ))}
              <th className="right" style={{ whiteSpace: 'nowrap', verticalAlign: 'top', fontSize: 10, color: 'var(--text-muted)' }}>
                <div>Quote</div>
                <div style={{ fontSize: 9, fontWeight: 600, marginTop: 2 }}>Source</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isAnchor = subject != null && r.symbol === subject
              const rowSource = r.source ?? 'fmp'
              return (
                <tr key={r.symbol} style={{ background: isAnchor ? 'rgba(99,102,241,0.06)' : undefined }}>
                  <td style={{ fontWeight: isAnchor ? 800 : 600 }}>
                    <a href={`${BASE}/app/company/${r.symbol}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                      {r.name} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({r.symbol})</span>
                    </a>
                  </td>
                  {metrics.map(m => (
                    <td key={m.key} className="right" style={{ color: r.cells[m.key]?.demo ? '#b45309' : 'var(--text-secondary)', fontWeight: isAnchor ? 700 : 500 }}>
                      <span title={`Source: ${r.cells[m.key]?.source ?? (r.cells[m.key]?.demo ? 'demo' : rowSource)}`}>
                        {r.cells[m.key]?.display ?? '—'}
                      </span>
                    </td>
                  ))}
                  <td className="right" style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                    {rowSource}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              {(['max','min','mean','median'] as const).map(agg => (
                <tr key={agg} style={{ background: 'var(--bg-elevated)' }}>
                  <td style={{ fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{agg}</td>
                  {metrics.map(m => {
                    const s = summary(rows, m.key)
                    return <td key={m.key} className="right" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{fmtSummary(m.key, s[agg])}</td>
                  })}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

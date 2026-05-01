'use client'

import { useEffect, useState } from 'react'

type SlimMetric = {
  id: string
  name: string
  type: string
  format: string
  isCurrency: boolean
  isImportant: boolean
  values: Array<{ period: string; reportDate: string; value: number | null; fiscalYear: number; fiscalQuarter: number }>
}
type SlimGroup = { title: string; metrics: SlimMetric[] }
type SlimResponse = {
  ok: true
  source: 'fiscal.ai'
  symbol: string
  reportingCurrency: string
  annual: { periods: string[]; groups: SlimGroup[] }
  quarterly: { periods: string[]; groups: SlimGroup[] }
}
type ErrorResponse = { ok: false; error: string; code?: string; symbol?: string }

const BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')

function fmtCurrency(v: number, currency: string): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  const sym = currency === 'USD' ? '$' : ''
  if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(1)}K`
  return `${sign}${sym}${abs.toFixed(0)}`
}
function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`
}
function fmtNum(v: number): string {
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return v.toFixed(0)
}
function fmtValue(m: SlimMetric, v: number | null, currency: string): string {
  if (v === null || v === undefined) return '—'
  if (m.format === '%') return fmtPct(v)
  if (m.isCurrency) return fmtCurrency(v, currency)
  return fmtNum(v)
}

function trendPct(values: Array<{ value: number | null }>): { delta: number | null } {
  const lastTwo = values.filter(v => v.value !== null).slice(-2)
  if (lastTwo.length < 2) return { delta: null }
  const [prev, cur] = lastTwo as Array<{ value: number }>
  if (prev.value === 0) return { delta: null }
  return { delta: ((cur.value - prev.value) / Math.abs(prev.value)) * 100 }
}

export default function SegmentsSection({ symbol }: { symbol: string }) {
  const [data, setData] = useState<SlimResponse | null>(null)
  const [error, setError] = useState<ErrorResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'annual' | 'quarterly'>('annual')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    setData(null)
    fetch(`${BASE}/api/segments?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .then((j: SlimResponse | ErrorResponse) => {
        if (!alive) return
        if (j.ok) setData(j)
        else setError(j)
      })
      .catch(e => alive && setError({ ok: false, error: e instanceof Error ? e.message : 'Network error' }))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [symbol])

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>Segments &amp; KPIs</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading from fiscal.ai…</div>
      </div>
    )
  }

  if (error || !data) {
    const code = error?.code
    if (code === 'out_of_coverage') {
      return (
        <div className="card" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Segments &amp; KPIs</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>VIA FISCAL.AI</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {symbol} is outside our current segments-data plan coverage. Mega-caps like MSFT, NVDA, AMZN, GOOG, TSLA are
            available today; broader coverage lights up when the data plan is upgraded.
          </div>
        </div>
      )
    }
    if (code === 'unauthorized') return null
    return (
      <div className="card" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Segments &amp; KPIs</div>
        <div style={{ fontSize: 12, color: 'var(--neg)' }}>Could not load: {error?.error || 'unknown error'}</div>
      </div>
    )
  }

  const view = period === 'annual' ? data.annual : data.quarterly
  if (view.groups.length === 0) {
    return (
      <div className="card" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Segments &amp; KPIs</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No {period} segment data reported for {symbol}.</div>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 20, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Segments &amp; KPIs</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{data.reportingCurrency} · reported by management</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border, var(--border))', borderRadius: 6, overflow: 'hidden' }}>
            {(['annual', 'quarterly'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: period === p ? 'var(--accent)' : '#fff',
                  color: period === p ? '#fff' : 'var(--text-secondary)',
                  border: 'none', textTransform: 'uppercase', letterSpacing: '0.04em',
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>VIA FISCAL.AI</span>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 220 }}>Metric</th>
              {view.periods.map(p => (
                <th key={p} style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p}</th>
              ))}
              <th style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>YoY</th>
            </tr>
          </thead>
          <tbody>
            {view.groups.map(g => (
              <GroupRows key={g.title} group={g} currency={data.reportingCurrency} periodCount={view.periods.length} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GroupRows({ group, currency, periodCount }: { group: SlimGroup; currency: string; periodCount: number }) {
  return (
    <>
      <tr>
        <td colSpan={periodCount + 2} style={{ padding: '12px 10px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg-elevated)' }}>
          {group.title}
        </td>
      </tr>
      {group.metrics.map(m => {
        const t = trendPct(m.values)
        return (
          <tr key={m.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
            <td style={{ padding: '7px 10px', color: m.isImportant ? 'var(--accent)' : 'var(--text-primary)', fontWeight: m.isImportant ? 600 : 400 }}>
              {m.name}
            </td>
            {m.values.map((v, i) => (
              <td key={i} style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtValue(m, v.value, currency)}
              </td>
            ))}
            <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
              color: t.delta === null ? 'var(--text-muted)' : t.delta >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
              {t.delta === null ? '—' : `${t.delta >= 0 ? '+' : ''}${t.delta.toFixed(1)}%`}
            </td>
          </tr>
        )
      })}
    </>
  )
}

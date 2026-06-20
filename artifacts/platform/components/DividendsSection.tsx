'use client'

import { useEffect, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

type Annual = { year: number; total: number; payments: number }
type SlimDividend = {
  exDate: string
  paymentDate: string | null
  recordDate: string | null
  declarationDate: string | null
  amount: number
  adjAmount: number
}

type DividendsResponse = {
  ok: true
  source: 'fmp'
  symbol: string
  paysDividend: boolean
  ttm: number
  yieldPct: number | null
  currentPrice: number | null
  growth: { y3: number | null; y5: number | null; y10: number | null }
  annual: Annual[]
  recent: SlimDividend[]
}
type ErrorResponse = { ok: false; error: string }

const BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')

function fmtUsd(v: number, digits = 2): string {
  return `$${v.toFixed(digits)}`
}
function fmtPct(v: number | null, digits = 2): string {
  return v === null || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)}%`
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function DividendsSection({ symbol }: { symbol: string }) {
  const [data, setData] = useState<DividendsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null); setData(null)
    fetch(`${BASE}/api/dividends?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .then((j: DividendsResponse | ErrorResponse) => {
        if (!alive) return
        if (j.ok) setData(j); else setError(j.error)
      })
      .catch(e => alive && setError(e instanceof Error ? e.message : 'Network error'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [symbol])

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Dividends</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading…</div>
      </div>
    )
  }
  if (error || !data) {
    return null
  }
  if (!data.paysDividend) {
    return (
      <div className="card" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Dividends</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>VIA FMP</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{symbol} does not currently pay a dividend.</div>
      </div>
    )
  }

  const chartData = data.annual.map(a => ({ year: String(a.year), value: Number(a.total.toFixed(4)) }))

  return (
    <div className="card" style={{ marginBottom: 20, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Dividends</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>per-share, USD</span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>VIA FMP</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Stat label="TTM dividend" value={fmtUsd(data.ttm, 2)} />
        <Stat label="Yield" value={fmtPct(data.yieldPct)} accent />
        <Stat label="3Y CAGR" value={fmtPct(data.growth.y3, 1)} />
        <Stat label="5Y CAGR" value={fmtPct(data.growth.y5, 1)} />
        <Stat label="10Y CAGR" value={fmtPct(data.growth.y10, 1)} />
      </div>

      {chartData.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Annual dividends per share
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
              <Tooltip
                contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 6 }}
                formatter={(v: number) => [`$${v.toFixed(4)}`, 'DPS']}
              />
              <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.recent.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Recent payments
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)', fontWeight: 600 }}>Ex-date</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)', fontWeight: 600 }}>Record</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)', fontWeight: 600 }}>Pay date</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--text-secondary)', fontWeight: 600 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map(r => (
                  <tr key={r.exDate} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '7px 10px', color: 'var(--text-primary)' }}>{fmtDate(r.exDate)}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-primary)' }}>{fmtDate(r.recordDate)}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-primary)' }}>{fmtDate(r.paymentDate)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {fmtUsd(r.adjAmount || r.amount, 4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

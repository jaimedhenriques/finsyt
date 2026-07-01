'use client'
import { useEffect, useState } from 'react'
import HoldersBreakdown from '@/components/company/HoldersBreakdown'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

function fmtShares(n: number) {
  if (!n) return '—'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return String(n)
}
function fmtUsd(n: number | null) {
  if (n == null || !n) return '—'
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T'
  if (n >= 1e9)  return '$' + (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6)  return '$' + (n / 1e6).toFixed(1) + 'M'
  return '$' + n.toLocaleString()
}

export default function OwnershipTab({ symbol }: { symbol: string }) {
  const [own, setOwn]           = useState<{ holders: any[]; asOf: string | null; note?: string }>({ holders: [], asOf: null })
  const [insiders, setInsiders] = useState<any[]>([])
  const [related, setRelated]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`${BASE}/api/ownership?symbol=${symbol}&limit=10`).then(r => r.json()).catch(() => ({ holders: [] })),
      fetch(`${BASE}/api/insider?symbol=${symbol}&limit=15`).then(r => r.json()).catch(() => ({})),
    ]).then(([o, ins]) => {
      setOwn({ holders: o?.holders || [], asOf: o?.asOf || null, note: o?.note })
      setInsiders(ins?.data || ins?.insiders || ins?.transactions || [])
      setRelated(ins?.relatedNews || [])
    }).finally(() => setLoading(false))
  }, [symbol])

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Major-holders breakdown (Yahoo, supplementary) */}
      <HoldersBreakdown symbol={symbol} />

      {/* Top 10 Institutional Holders */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Top 10 Institutional Holders</span>
          {own.asOf && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>As of {own.asOf}</span>}
        </div>
        <table className="data-table">
          <thead><tr><th>Holder</th><th className="right">Shares</th><th className="right">Value</th><th className="right">Δ Shares</th><th className="right">Δ %</th></tr></thead>
          <tbody>
            {loading ? Array(8).fill(0).map((_, i) => (
              <tr key={i}>{Array(5).fill(0).map((_, j) => <td key={j}><span className="skeleton" style={{ width: '80%', height: 12 }} /></td>)}</tr>
            )) : own.holders.length ? own.holders.map((h: any, i: number) => {
              const pct = h.changePct == null ? null : Number(h.changePct)
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{h.name}</td>
                  <td className="right">{fmtShares(h.shares)}</td>
                  <td className="right">{fmtUsd(h.value)}</td>
                  <td className="right" style={{ color: h.change > 0 ? 'var(--pos)' : h.change < 0 ? 'var(--neg)' : 'var(--text-muted)' }}>
                    {h.change > 0 ? '+' : ''}{fmtShares(h.change)}
                  </td>
                  <td className="right" style={{ color: (pct ?? 0) > 0 ? 'var(--pos)' : (pct ?? 0) < 0 ? 'var(--neg)' : 'var(--text-muted)', fontWeight: 600 }}>
                    {pct != null && !Number.isNaN(pct) ? `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%` : '—'}
                  </td>
                </tr>
              )
            }) : (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
                {own.note || 'No institutional holdings reported by the data provider.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Insider Transactions + Alt-data lane */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
            Insider Transactions
          </div>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Insider</th><th>Type</th><th className="right">Shares</th><th className="right">Price</th><th className="right">Value</th></tr></thead>
            <tbody>
              {loading ? Array(6).fill(0).map((_, i) => (
                <tr key={i}>{Array(6).fill(0).map((_, j) => <td key={j}><span className="skeleton" style={{ width: '80%', height: 12 }} /></td>)}</tr>
              )) : insiders.length ? insiders.slice(0, 12).map((t: any, i: number) => {
                const isBuy = String(t.transactionType || '').toLowerCase().includes('buy') ||
                              String(t.transactionType || '').includes('P-Purchase') ||
                              (Number(t.change) || 0) > 0
                return (
                  <tr key={i}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{(t.date || '').slice(0, 10)}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.reportingName || '—'}</td>
                    <td><span className={`badge ${isBuy ? 'badge-green' : 'badge-red'}`}>{isBuy ? 'Buy' : 'Sell'}</span></td>
                    <td className="right">{fmtShares(Math.abs(Number(t.change) || 0))}</td>
                    <td className="right">{t.price ? `$${Number(t.price).toFixed(2)}` : '—'}</td>
                    <td className="right" style={{ fontWeight: 600 }}>{t.value ? fmtUsd(Math.abs(t.value)) : '—'}</td>
                  </tr>
                )
              }) : <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No insider activity in the last 90 days.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Alt-data lane — provider-backed only, with empty states for unconnected sources */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
            Alt-Data Signals
          </div>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Hiring trend (CoreSignal)</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Connect a CoreSignal company ID via the admin console to populate live headcount and attrition.
            </div>
          </div>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Volume anomaly (Databento)</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Subscribe a Databento equities-trades feed to surface unusual block trades.
            </div>
          </div>
          <div style={{ padding: '14px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Insider-related newswire</div>
            {related.length ? related.slice(0, 4).map((n: any, i: number) => (
              <a key={i} href={n.url || '#'} target="_blank" rel="noreferrer"
                 style={{ display: 'block', padding: '6px 0', borderBottom: i === Math.min(related.length, 4) - 1 ? 'none' : '1px dashed var(--border)', textDecoration: 'none' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>{n.title}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{n.source} · {(n.publishedAt || '').slice(0, 10)}</div>
              </a>
            )) : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No insider-related headlines.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

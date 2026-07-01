'use client'
import { useEffect, useState } from 'react'
import YahooComplianceNote from '@/components/YahooComplianceNote'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

type Row = { date: string | null; firm: string | null; toGrade: string | null; fromGrade: string | null; action: string | null }

const ACTION_TONE: Record<string, { bg: string; label: string }> = {
  up:   { bg: 'var(--pos)', label: 'Upgrade' },
  down: { bg: 'var(--neg)', label: 'Downgrade' },
  init: { bg: 'var(--accent)', label: 'Initiate' },
  main: { bg: 'var(--text-muted)', label: 'Maintain' },
  reit: { bg: 'var(--text-muted)', label: 'Reiterate' },
}

export default function UpgradeHistory({ symbol }: { symbol: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true)
    fetch(`${BASE}/api/upgrades?symbol=${encodeURIComponent(symbol)}&limit=25`)
      .then(r => r.json())
      .then(d => { if (live) setRows(Array.isArray(d?.history) ? d.history : []) })
      .catch(() => { if (live) setRows([]) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [symbol])

  if (loading) {
    return (
      <div className="card" style={{ padding: '14px 20px' }}>
        <span className="skeleton" style={{ width: 200, height: 14, display: 'block', marginBottom: 12 }} />
        <span className="skeleton" style={{ width: '100%', height: 60, display: 'block' }} />
      </div>
    )
  }
  if (!rows.length) return null

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Analyst Upgrade / Downgrade History</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>source: yahoo</span>
      </div>
      <table className="data-table">
        <thead><tr><th>Date</th><th>Firm</th><th>Action</th><th>From</th><th>To</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const tone = ACTION_TONE[String(r.action || '').toLowerCase()] || ACTION_TONE.main
            return (
              <tr key={i}>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.date || '—'}</td>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.firm || '—'}</td>
                <td>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: '#fff', background: tone.bg }}>
                    {tone.label}
                  </span>
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.fromGrade || '—'}</td>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.toGrade || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
        <YahooComplianceNote compact />
      </div>
    </div>
  )
}

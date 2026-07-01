'use client'
import { useEffect, useState } from 'react'
import YahooComplianceNote from '@/components/YahooComplianceNote'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

type Esg = {
  totalEsg: number | null
  environmentScore: number | null
  socialScore: number | null
  governanceScore: number | null
  esgPerformance: string | null
  percentile: number | null
  highestControversy: number | null
  ratingYear: number | null
}

function Bar({ label, value, max = 40 }: { label: string; value: number | null; max?: number }) {
  const pct = value == null ? 0 : Math.min(100, (value / max) * 100)
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{value == null ? '—' : value.toFixed(1)}</span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
      </div>
    </div>
  )
}

export default function EsgCard({ symbol }: { symbol: string }) {
  const [esg, setEsg] = useState<Esg | null>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    fetch(`${BASE}/api/esg?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .then(d => { if (!live) return; setEsg(d?.esg || null); setNote(d?.note || null) })
      .catch(() => { if (live) { setEsg(null); setNote('ESG data unavailable.') } })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [symbol])

  if (loading) {
    return (
      <div className="card" style={{ padding: '14px 20px' }}>
        <span className="skeleton" style={{ width: 140, height: 14, display: 'block', marginBottom: 12 }} />
        <span className="skeleton" style={{ width: '100%', height: 40, display: 'block' }} />
      </div>
    )
  }
  if (!esg) return null // no rating: render nothing on overview to avoid noise

  return (
    <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>ESG / Sustainability</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>source: yahoo{esg.ratingYear ? ` · ${esg.ratingYear}` : ''}</span>
      </div>
      <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'center' }}>
        <div style={{ textAlign: 'center', minWidth: 90 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
            {esg.totalEsg == null ? '—' : esg.totalEsg.toFixed(1)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total ESG Risk</div>
          {esg.esgPerformance && (
            <div style={{ fontSize: 11, marginTop: 6, color: 'var(--text-secondary)', fontWeight: 600 }}>{esg.esgPerformance.replace(/_/g, ' ')}</div>
          )}
          {esg.percentile != null && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{esg.percentile.toFixed(0)}th pctile</div>
          )}
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <Bar label="Environment" value={esg.environmentScore} />
          <Bar label="Social" value={esg.socialScore} />
          <Bar label="Governance" value={esg.governanceScore} />
          {esg.highestControversy != null && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Highest controversy level: <strong style={{ color: 'var(--text-primary)' }}>{esg.highestControversy}</strong> / 5
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: '0 20px 14px' }}>
        <YahooComplianceNote compact />
      </div>
    </div>
  )
}

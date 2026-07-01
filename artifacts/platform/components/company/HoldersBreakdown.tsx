'use client'
import { useEffect, useState } from 'react'
import YahooComplianceNote from '@/components/YahooComplianceNote'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

type Breakdown = {
  insidersPct: number | null
  institutionsPct: number | null
  institutionsFloatPct: number | null
  institutionsCount: number | null
}

function Stat({ label, value, suffix = '%' }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div style={{ padding: '12px 16px', borderRight: '1px solid var(--border)', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
        {value == null ? '—' : `${value.toLocaleString(undefined, { maximumFractionDigits: suffix === '%' ? 2 : 0 })}${suffix}`}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}

export default function HoldersBreakdown({ symbol }: { symbol: string }) {
  const [b, setB] = useState<Breakdown | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true)
    fetch(`${BASE}/api/ownership?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .then(d => { if (live) setB(d?.breakdown || null) })
      .catch(() => { if (live) setB(null) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [symbol])

  if (loading) {
    return (
      <div className="card" style={{ padding: '14px 20px' }}>
        <span className="skeleton" style={{ width: 160, height: 14, display: 'block', marginBottom: 12 }} />
        <span className="skeleton" style={{ width: '100%', height: 32, display: 'block' }} />
      </div>
    )
  }
  if (!b) return null

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Major Holders Breakdown</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>source: yahoo</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <Stat label="% Held by Insiders" value={b.insidersPct} />
        <Stat label="% Held by Institutions" value={b.institutionsPct} />
        <Stat label="% Float Held by Inst." value={b.institutionsFloatPct} />
        <Stat label="Institutions" value={b.institutionsCount} suffix="" />
      </div>
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
        <YahooComplianceNote compact />
      </div>
    </div>
  )
}

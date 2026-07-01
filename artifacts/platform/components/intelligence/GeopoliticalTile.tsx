'use client'
import { useEffect, useState } from 'react'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

interface GeopoliticalResult {
  isoCode: string
  countryName: string
  cii: number
  ciiLabel: 'Low' | 'Moderate' | 'Elevated' | 'High' | 'Very High'
  wgiComposite: number | null
  wgiBreakdown: Record<string, number | null>
  gdeltIntensity: number | null
  latestYear: number | null
  source: string
  fetchedAt: string
  unavailable?: boolean
  unavailableReason?: string
}

const CII_COLORS: Record<string, { bg: string; fg: string; bar: string }> = {
  Low:        { bg: 'rgba(14,159,110,0.08)', fg: '#0E9F6E', bar: '#0E9F6E' },
  Moderate:   { bg: 'rgba(3,118,224,0.08)', fg: '#0376E0', bar: '#0376E0' },
  Elevated:   { bg: 'rgba(251,191,36,0.10)', fg: '#B45309', bar: '#D97706' },
  High:       { bg: 'rgba(239,68,68,0.08)', fg: '#DC2626', bar: '#EF4444' },
  'Very High':{ bg: 'rgba(127,29,29,0.10)', fg: '#7F1D1D', bar: '#991B1B' },
}

const WGI_LABELS: Record<string, string> = {
  politicalStability:      'Political Stability',
  governmentEffectiveness: 'Gov. Effectiveness',
  ruleOfLaw:              'Rule of Law',
  regulatoryQuality:      'Regulatory Quality',
  controlCorruption:      'Control of Corruption',
  voiceAccountability:    'Voice & Accountability',
}

interface Props {
  iso: string
  countryName?: string
  compact?: boolean
}

export default function GeopoliticalTile({ iso, countryName, compact }: Props) {
  const [data, setData] = useState<GeopoliticalResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`${BASE}/api/intelligence/geopolitical?iso=${encodeURIComponent(iso)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [iso])

  const display = countryName || data?.countryName || iso
  const colors = data ? (CII_COLORS[data.ciiLabel] || CII_COLORS.Moderate) : CII_COLORS.Moderate

  if (loading) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Geopolitical Risk · {display}</div>
        <div style={{ height: 40, background: 'var(--bg-secondary)', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />
      </div>
    )
  }

  if (!data || data.unavailable) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Geopolitical Risk · {display}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Source unavailable: {data?.unavailableReason || 'No data from World Bank WGI / GDELT'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Source: World Bank WGI / GDELT</div>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Geopolitical Risk · {data.countryName}
          </div>
          {data.latestYear && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>WGI {data.latestYear}</div>
          )}
        </div>
        <div style={{
          padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: colors.bg, color: colors.fg, border: `1px solid ${colors.bar}30`,
        }}>
          {data.ciiLabel}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: '2rem', color: colors.fg, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {data.cii}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Country Instability Index (0–100)</div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${data.cii}%`, borderRadius: 3, background: colors.bar, transition: 'width 0.6s ease' }} />
          </div>
        </div>
      </div>

      {!compact && Object.keys(data.wgiBreakdown).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 10 }}>
          {Object.entries(data.wgiBreakdown).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'var(--text-muted)' }}>{WGI_LABELS[k] || k}</span>
              <span style={{ fontWeight: 600, color: v == null ? 'var(--text-muted)' : v < 0 ? 'var(--neg)' : 'var(--pos)' }}>
                {v == null ? '—' : v.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
        Source: {data.source} · {data.fetchedAt ? new Date(data.fetchedAt).toLocaleDateString() : ''}
      </div>
    </div>
  )
}

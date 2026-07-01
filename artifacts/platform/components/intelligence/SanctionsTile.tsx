'use client'
import { useEffect, useState } from 'react'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

interface SanctionsHit {
  listName: string
  listCode: string
  entityName: string
  entityType: string
  programs?: string[]
  score: number
}

interface SanctionsResult {
  query: string
  overallStatus: 'HIT' | 'NO_HIT' | 'UNKNOWN'
  hits: SanctionsHit[]
  listsChecked: string[]
  listErrors: string[]
  source: string
  fetchedAt: string
  unavailable?: boolean
  unavailableReason?: string
}

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  HIT:     { bg: 'rgba(239,68,68,0.10)', fg: '#DC2626', label: 'SANCTIONS HIT' },
  NO_HIT:  { bg: 'rgba(14,159,110,0.08)', fg: '#0E9F6E', label: 'NO MATCH' },
  UNKNOWN: { bg: 'rgba(251,191,36,0.10)', fg: '#B45309', label: 'UNKNOWN' },
}

const LIST_BADGE: Record<string, { label: string; color: string }> = {
  OFAC:  { label: 'OFAC SDN', color: '#1B4FFF' },
  EU_FSF:{ label: 'EU FSF', color: '#003399' },
  UN_SC: { label: 'UN SC', color: '#009EDB' },
}

interface Props {
  entityName: string
  compact?: boolean
}

export default function SanctionsTile({ entityName, compact }: Props) {
  const [data, setData] = useState<SanctionsResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!entityName) return
    let cancelled = false
    setLoading(true)
    fetch(`${BASE}/api/intelligence/sanctions?entity=${encodeURIComponent(entityName)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [entityName])

  if (loading) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Sanctions Screening</div>
        <div style={{ height: 40, background: 'var(--bg-secondary)', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />
      </div>
    )
  }

  if (!data || data.unavailable) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Sanctions Screening</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {data?.unavailableReason || 'Screening unavailable — lists could not be accessed'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Source: OFAC SDN / EU FSF / UN Security Council</div>
      </div>
    )
  }

  const style = STATUS_STYLES[data.overallStatus] || STATUS_STYLES.UNKNOWN

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sanctions Screening</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>"{data.query}"</div>
        </div>
        <div style={{
          padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 800,
          background: style.bg, color: style.fg, letterSpacing: '0.06em',
        }}>
          {style.label}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {data.listsChecked.map((list, i) => {
          const code = Object.keys(LIST_BADGE).find(k => list.includes(LIST_BADGE[k].label.split(' ')[0]))
          const badge = code ? LIST_BADGE[code] : null
          const hasError = data.listErrors.some(e => e.toLowerCase().includes(list.split(' ')[0].toLowerCase()))
          return (
            <span key={i} style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
              background: hasError ? 'var(--bg-secondary)' : (badge?.color || '#666') + '15',
              color: hasError ? 'var(--text-muted)' : (badge?.color || '#666'),
              border: `1px solid ${hasError ? 'var(--border)' : (badge?.color || '#666') + '30'}`,
            }}>
              {badge?.label || list} {hasError ? '(error)' : data.overallStatus === 'NO_HIT' ? '✓' : ''}
            </span>
          )
        })}
      </div>

      {!compact && data.hits.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          {data.hits.slice(0, 3).map((hit, i) => {
            const badge = LIST_BADGE[hit.listCode]
            return (
              <div key={i} style={{
                padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)',
                background: 'rgba(239,68,68,0.05)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                    background: (badge?.color || '#666') + '20',
                    color: badge?.color || '#666',
                  }}>{badge?.label || hit.listCode}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{hit.entityName}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{Math.round(hit.score * 100)}% match</span>
                </div>
                {hit.programs && hit.programs.length > 0 && (
                  <div style={{ fontSize: 10, color: '#DC2626', marginTop: 4 }}>Programs: {hit.programs.join(', ')}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {data.overallStatus === 'NO_HIT' && (
        <div style={{ fontSize: 12, color: '#0E9F6E', marginBottom: 8 }}>
          ✓ No matches found across {data.listsChecked.length} lists
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
        Source: {data.source} · {data.fetchedAt ? new Date(data.fetchedAt).toLocaleDateString() : ''}
      </div>
    </div>
  )
}

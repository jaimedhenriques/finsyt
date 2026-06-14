'use client'
/**
 * Geopolitical Exposure tile (Task #400)
 * ──────────────────────────────────────
 * Read-only geopolitical risk signal for the company page overview tab.
 * Fetches `/api/geopolitical-events?region=<HQ country>` which surfaces recent
 * conflict / political / disaster / sanctions coverage relevant to the
 * company's headquarters region from the public, keyless GDELT dataset.
 *
 * No connector needed and no predictive scoring — `severity` is a transparent
 * category-derived label. When the HQ country is unknown or no events match,
 * the tile renders a neutral empty state (not a connect CTA). Each row links to
 * the originating article and exposes a citation chip for the page drawer.
 */
import { useEffect, useState } from 'react'
import { Badge, Skeleton } from '@/components/ui'
import type { CiteFn, AltDataCitation } from '@/components/alt-data/cards'

type GeoSeverity = 'high' | 'medium' | 'low'
type GeoCategory = 'conflict' | 'political' | 'disaster' | 'economic' | 'geopolitical'

interface GeoEvent {
  id: string
  title: string
  category: GeoCategory
  severity: GeoSeverity
  location: string | null
  date: string | null
  url: string
  domain: string | null
  source: string
}

interface ApiResult {
  events: GeoEvent[]
  source: string
  count: number
  region: string | null
  regionName: string | null
  providerError: string | null
  fetchedAt: string
}

const cardHeaderStyle: React.CSSProperties = {
  padding: '14px 16px', borderBottom: '1px solid var(--border)',
  fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
}

const SEVERITY_TONE: Record<GeoSeverity, 'red' | 'amber' | 'gray'> = {
  high: 'red', medium: 'amber', low: 'gray',
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function buildCitation(e: GeoEvent, fetchedAt: string): AltDataCitation {
  return {
    provider: e.source,
    title: e.title,
    subtitle: e.location || undefined,
    url: e.url,
    fields: [
      { label: 'Category', value: e.category },
      { label: 'Severity', value: e.severity },
      { label: 'Location', value: e.location || '—' },
      { label: 'Published', value: fmtDate(e.date) || '—' },
      { label: 'Outlet', value: e.domain || '—' },
    ],
    retrievedAt: fetchedAt,
    raw: e,
  }
}

export default function GeopoliticalExposureTile({
  region, regionLabel, onCite, limit = 6,
}: { region?: string; regionLabel?: string; onCite?: CiteFn; limit?: number }) {
  const [data, setData] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
    const sp = new URLSearchParams({ limit: String(limit) })
    if (region) sp.set('region', region)
    fetch(`${base}/api/geopolitical-events?${sp.toString()}`)
      .then(r => r.json())
      .then((res: ApiResult) => { if (!cancelled) setData(res) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [region, limit])

  const events = data?.events || []
  const where = data?.regionName || regionLabel || region || 'global markets'

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={cardHeaderStyle}>
        <span>Geopolitical Exposure</span>
        <Badge tone="amber" style={{ fontSize: 9 }}>GDELT</Badge>
      </div>

      {loading ? (
        <div style={{ padding: '4px 0' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ padding: '12px 16px', borderBottom: i === 2 ? 'none' : '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <Skeleton style={{ height: 12, flex: 1 }} />
              <Skeleton style={{ height: 12, width: 48 }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          Geopolitical events are unavailable right now.
        </div>
      ) : events.length === 0 ? (
        <div style={{ padding: '22px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.55 }}>
          No notable geopolitical events for {where} in the last week.
          <div style={{ marginTop: 6, fontSize: 11 }}>
            Browse the full feed on the <a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/app/macro`} style={{ color: 'var(--accent-text)' }}>Macro → Geopolitics</a> view.
          </div>
        </div>
      ) : (
        <>
          {events.map((e, i) => (
            <div key={e.id} style={{ padding: '10px 16px', borderBottom: i === events.length - 1 ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                </a>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Badge tone={SEVERITY_TONE[e.severity]} style={{ fontSize: 9 }}>{e.severity}</Badge>
                  <span style={{ textTransform: 'capitalize' }}>{e.category}</span>
                  {e.location && <span>· {e.location}</span>}
                  {e.date && <span>· {fmtDate(e.date)}</span>}
                </div>
              </div>
              {onCite && (
                <button
                  type="button"
                  title="View source"
                  onClick={() => onCite(`${e.source} — geopolitical event`, e.title, buildCitation(e, data?.fetchedAt || new Date().toISOString()))}
                  style={{
                    marginLeft: 4, padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800,
                    border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                    color: 'var(--accent-text)', cursor: 'pointer', flexShrink: 0,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}
                >[{i + 1}]</button>
              )}
            </div>
          ))}
          <div style={{ padding: '8px 16px', fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            Open-data geopolitical signal · severity is category-derived (not a forecast) · source: {data?.source && data.source !== 'none' ? data.source : 'GDELT'}
          </div>
        </>
      )}
    </div>
  )
}

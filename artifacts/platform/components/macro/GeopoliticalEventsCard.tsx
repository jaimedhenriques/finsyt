'use client'
/**
 * Geopolitical Events card (Task #400)
 * ────────────────────────────────────
 * Filterable geopolitical risk & events feed for the Macro workspace, built on
 * the public, keyless GDELT DOC 2.0 dataset. Users can scope by region,
 * category, severity and look-back window. No proprietary feeds, no predictive
 * scoring — `severity` is a transparent category-derived label.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui'

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
  categoryCounts: Record<GeoCategory, number>
  providerError: string | null
  fetchedAt: string
}

const REGIONS = [
  { code: '', name: 'Global' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CN', name: 'China' },
  { code: 'JP', name: 'Japan' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IN', name: 'India' },
  { code: 'RU', name: 'Russia' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'IL', name: 'Israel' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'BR', name: 'Brazil' },
]

const CATEGORIES: { value: '' | GeoCategory; label: string }[] = [
  { value: '', label: 'All categories' },
  { value: 'conflict', label: 'Conflict' },
  { value: 'political', label: 'Political' },
  { value: 'disaster', label: 'Disaster' },
  { value: 'economic', label: 'Economic' },
  { value: 'geopolitical', label: 'Other' },
]

const SEVERITIES: { value: '' | GeoSeverity; label: string }[] = [
  { value: '', label: 'Any severity' },
  { value: 'high', label: 'High only' },
  { value: 'medium', label: 'Medium+' },
  { value: 'low', label: 'Low+' },
]

const TIMESPANS = [
  { value: '24h', label: '24h' },
  { value: '3d', label: '3d' },
  { value: '7d', label: '7d' },
  { value: '14d', label: '14d' },
]

const SEVERITY_TONE: Record<GeoSeverity, 'red' | 'amber' | 'gray'> = {
  high: 'red', medium: 'amber', low: 'gray',
}

function fmtDateTime(d: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
  border: '1.5px solid var(--border)', background: '#fff', color: '#0A1628', cursor: 'pointer',
}

export default function GeopoliticalEventsCard() {
  const [region, setRegion] = useState('')
  const [category, setCategory] = useState<'' | GeoCategory>('')
  const [severity, setSeverity] = useState<'' | GeoSeverity>('')
  const [timespan, setTimespan] = useState('7d')
  const [data, setData] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sp = new URLSearchParams({ limit: '40', timespan })
      if (region) sp.set('region', region)
      if (category) sp.set('category', category)
      if (severity) sp.set('severity', severity)
      const res = await fetch(`/api/geopolitical-events?${sp.toString()}`)
      const json: ApiResult = await res.json()
      setData(json)
      if (json.providerError && !json.events.length) setError(json.providerError)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [region, category, severity, timespan])

  useEffect(() => { load() }, [load])

  const events = data?.events || []
  const counts = data?.categoryCounts
  const summary = useMemo(() => {
    if (!counts) return ''
    return (['conflict', 'political', 'disaster', 'economic'] as GeoCategory[])
      .filter((c) => counts[c] > 0)
      .map((c) => `${counts[c]} ${c}`)
      .join(' · ')
  }, [counts])

  return (
    <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #E2E8F2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#0A1628' }}>Geopolitical Events</span>
          <span style={{ marginLeft: 8, fontSize: 11, color: '#B0BCD0' }}>
            Source: GDELT Project · open data{summary ? ` · ${summary}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select value={region} onChange={(e) => setRegion(e.target.value)} style={selectStyle} aria-label="Region">
            {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value as '' | GeoCategory)} style={selectStyle} aria-label="Category">
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as '' | GeoSeverity)} style={selectStyle} aria-label="Severity">
            {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 4 }}>
            {TIMESPANS.map((t) => (
              <button key={t.value} onClick={() => setTimespan(t.value)}
                style={{ padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid',
                  borderColor: timespan === t.value ? 'var(--accent)' : 'var(--border)',
                  background: timespan === t.value ? 'var(--accent)' : '#fff',
                  color: timespan === t.value ? '#fff' : '#7D8FA9' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: '#B0BCD0', fontSize: 13 }}>Loading geopolitical events…</div>
      ) : error ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--neg)', fontSize: 13 }}>
          Geopolitical feed unavailable: {error}
        </div>
      ) : events.length === 0 ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: '#B0BCD0', fontSize: 13 }}>
          No geopolitical events match these filters in the selected window.
        </div>
      ) : (
        <div>
          {events.map((e, i) => (
            <div key={e.id} style={{ padding: '12px 20px', borderBottom: i === events.length - 1 ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <Badge tone={SEVERITY_TONE[e.severity]} style={{ fontSize: 9, marginTop: 2, flexShrink: 0 }}>{e.severity}</Badge>
              <div style={{ minWidth: 0, flex: 1 }}>
                <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>{e.title}</span>
                </a>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{e.category}</span>
                  {e.location && <span>· {e.location}</span>}
                  {e.domain && <span>· {e.domain}</span>}
                  {e.date && <span>· {fmtDateTime(e.date)}</span>}
                </div>
              </div>
            </div>
          ))}
          <div style={{ padding: '8px 20px', fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            Open-data geopolitical signal from GDELT · severity is category-derived (not a forecast) · {events.length} events
          </div>
        </div>
      )}
    </div>
  )
}

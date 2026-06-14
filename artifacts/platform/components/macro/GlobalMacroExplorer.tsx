'use client'
/**
 * GlobalMacroExplorer
 * ───────────────────
 * Cross-country macro search + compare surface for the Macro workspace.
 * Lets an analyst pull any IMF DataMapper / World Bank indicator (by ISO
 * country) or any DBnomics series (by provider/dataset/series id) and overlay
 * several of them on one chart for comparison.
 *
 * All upstreams are keyless and proxied through our own internal routes:
 *   - IMF       → /api/imf/{indicators,data}
 *   - World Bank→ /api/worldbank/{indicators,data}
 *   - DBnomics  → /api/dbnomics/{series}
 *
 * Honest states: every added series carries its own loading / error / empty
 * status so an unreachable upstream (DBnomics is frequently blocked) degrades
 * the single line rather than the whole surface.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

type Source = 'imf' | 'worldbank' | 'dbnomics'

const SOURCE_META: Record<Source, { label: string; tagline: string; defaultCountry: string }> = {
  imf:       { label: 'IMF',        tagline: 'WEO / Fiscal Monitor · annual · incl. forecasts', defaultCountry: 'USA' },
  worldbank: { label: 'World Bank', tagline: 'Open Data · ~1,500 development & macro indicators', defaultCountry: 'US' },
  dbnomics:  { label: 'DBnomics',   tagline: '90+ providers · Eurostat, ECB, BIS, OECD, …',       defaultCountry: '' },
}

const PALETTE = ['#1B4FFF', '#16A34A', '#DC2626', '#9333EA', '#EA580C', '#0891B2', '#CA8A04', '#DB2777']

interface FeaturedItem { id: string; name: string; category?: string }
interface IndicatorHit { id: string; label?: string; name?: string }

interface SeriesPoint { period: string; value: number | null }
interface AddedSeries {
  key: string
  source: Source
  label: string
  color: string
  loading: boolean
  error: string | null
  points: SeriesPoint[]
}

// ── Normalisers ───────────────────────────────────────────────────────────────
interface ObsRow { countryIso3?: string; date?: string; period?: string; value?: number | null }

function normalizeObservations(rows: ObsRow[], country?: string): SeriesPoint[] {
  const want = country ? country.toUpperCase() : ''
  return rows
    .filter(r => !want || (r.countryIso3 || '').toUpperCase() === want || !r.countryIso3)
    .map(r => ({ period: String(r.date ?? r.period ?? ''), value: r.value == null ? null : Number(r.value) }))
    .filter(p => p.period)
    .sort((a, b) => a.period.localeCompare(b.period))
}

export default function GlobalMacroExplorer() {
  const [source, setSource] = useState<Source>('imf')

  // IMF / World Bank inputs
  const [indicatorQuery, setIndicatorQuery] = useState('')
  const [indicatorHits, setIndicatorHits] = useState<IndicatorHit[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedIndicator, setSelectedIndicator] = useState<{ id: string; label: string } | null>(null)
  const [country, setCountry] = useState('USA')

  // DBnomics input
  const [seriesIdInput, setSeriesIdInput] = useState('')

  // Featured starting points (per source)
  const [featured, setFeatured] = useState<FeaturedItem[]>([])

  // Added series (the chart)
  const [series, setSeries] = useState<AddedSeries[]>([])
  const colorIdx = useRef(0)

  // Load featured list whenever the source changes.
  useEffect(() => {
    let cancelled = false
    setFeatured([])
    setIndicatorHits([])
    setSelectedIndicator(null)
    setIndicatorQuery('')
    setCountry(SOURCE_META[source].defaultCountry)
    const url = source === 'dbnomics'
      ? `${BASE}/api/dbnomics/series?featured=true`
      : `${BASE}/api/${source}/indicators?featured=true`
    fetch(url)
      .then(r => r.json())
      .then(d => { if (!cancelled && Array.isArray(d?.featured)) setFeatured(d.featured) })
      .catch(() => { /* featured is a convenience; ignore failures */ })
    return () => { cancelled = true }
  }, [source])

  // Debounced indicator search for IMF / World Bank.
  useEffect(() => {
    if (source === 'dbnomics') return
    const q = indicatorQuery.trim()
    if (q.length < 2) { setIndicatorHits([]); return }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(() => {
      fetch(`${BASE}/api/${source}/indicators?q=${encodeURIComponent(q)}&limit=20`)
        .then(r => r.json())
        .then(d => { if (!cancelled) setIndicatorHits(Array.isArray(d?.indicators) ? d.indicators : []) })
        .catch(() => { if (!cancelled) setIndicatorHits([]) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [indicatorQuery, source])

  const nextColor = () => { const c = PALETTE[colorIdx.current % PALETTE.length]; colorIdx.current += 1; return c }

  const fetchSeries = useCallback(async (s: AddedSeries, url: string, country?: string) => {
    try {
      const res = await fetch(url)
      const d = await res.json()
      if (!res.ok || d?.error) {
        throw new Error(d?.error || `upstream ${res.status}`)
      }
      const points = source === 'dbnomics'
        ? normalizeObservations(Array.isArray(d?.observations) ? d.observations : [])
        : normalizeObservations(Array.isArray(d?.observations) ? d.observations : [], country)
      const label = source === 'dbnomics' && d?.seriesName ? `${d.seriesName}` : s.label
      setSeries(prev => prev.map(x => x.key === s.key
        ? { ...x, loading: false, error: points.length ? null : 'No observations returned', points, label }
        : x))
    } catch (e) {
      setSeries(prev => prev.map(x => x.key === s.key
        ? { ...x, loading: false, error: (e as Error).message || 'Failed to load' }
        : x))
    }
  }, [source])

  const addImfOrWb = useCallback(() => {
    const id = selectedIndicator?.id || indicatorQuery.trim()
    if (!id) return
    const indLabel = selectedIndicator?.label || id
    const codes = (country || SOURCE_META[source].defaultCountry || '')
      .split(/[;,]/).map(c => c.trim().toUpperCase()).filter(Boolean)
    const list = codes.length ? codes : ['']
    const added: AddedSeries[] = []
    for (const code of list) {
      const key = `${source}:${id}:${code}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`
      const label = `${indLabel}${code ? ` · ${code}` : ''} (${SOURCE_META[source].label})`
      added.push({ key, source, label, color: nextColor(), loading: true, error: null, points: [] })
    }
    setSeries(prev => [...prev, ...added])
    for (const a of added) {
      const code = a.label.match(/· ([A-Z]+) \(/)?.[1] || ''
      const url = `${BASE}/api/${source}/data?indicator=${encodeURIComponent(id)}${code ? `&country=${encodeURIComponent(code)}` : ''}`
      fetchSeries(a, url, code)
    }
  }, [selectedIndicator, indicatorQuery, country, source, fetchSeries])

  const addDbnomics = useCallback((rawId?: string) => {
    const id = (rawId ?? seriesIdInput).trim()
    if (!id) return
    const key = `dbnomics:${id}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`
    const s: AddedSeries = { key, source: 'dbnomics', label: `${id} (DBnomics)`, color: nextColor(), loading: true, error: null, points: [] }
    setSeries(prev => [...prev, s])
    fetchSeries(s, `${BASE}/api/dbnomics/series?id=${encodeURIComponent(id)}`)
  }, [seriesIdInput, fetchSeries])

  const removeSeries = (key: string) => setSeries(prev => prev.filter(s => s.key !== key))
  const clearAll = () => setSeries([])

  // Merge all series into chart rows keyed by period.
  const chartRows = useMemo(() => {
    const byPeriod = new Map<string, Record<string, string | number | null>>()
    for (const s of series) {
      for (const p of s.points) {
        if (!byPeriod.has(p.period)) byPeriod.set(p.period, { period: p.period })
        byPeriod.get(p.period)![s.key] = p.value
      }
    }
    return Array.from(byPeriod.values()).sort((a, b) => String(a.period).localeCompare(String(b.period)))
  }, [series])

  const anyLoading = series.some(s => s.loading)
  const ready = series.filter(s => !s.loading && !s.error && s.points.length)

  return (
    <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #E2E8F2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#0A1628' }}>Global Macro Explorer</span>
          <span style={{ marginLeft: 8, fontSize: 11, color: '#B0BCD0' }}>Search, chart &amp; compare any country — IMF · World Bank · DBnomics</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(Object.keys(SOURCE_META) as Source[]).map(s => (
            <button key={s} onClick={() => setSource(s)}
              style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1.5px solid', transition: 'all 0.1s',
                borderColor: source === s ? 'var(--accent)' : 'var(--border)',
                background: source === s ? 'var(--accent)' : '#fff',
                color: source === s ? '#fff' : '#7D8FA9' }}>
              {SOURCE_META[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F2', background: '#FBFCFE' }}>
        <div style={{ fontSize: 11, color: '#7D8FA9', marginBottom: 10 }}>{SOURCE_META[source].tagline}</div>

        {source !== 'dbnomics' ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* Indicator search */}
            <div style={{ position: 'relative', flex: '1 1 320px', minWidth: 240 }}>
              <input
                value={indicatorQuery}
                onChange={e => { setIndicatorQuery(e.target.value); setSelectedIndicator(null) }}
                placeholder={source === 'imf' ? 'Search IMF indicators (e.g. GDP, debt, NGDP_RPCH)…' : 'Search World Bank indicators (e.g. GDP, inflation)…'}
                style={inputStyle}
              />
              {selectedIndicator && (
                <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, fontWeight: 600 }}>
                  Selected: {selectedIndicator.label} <span style={{ color: '#B0BCD0' }}>({selectedIndicator.id})</span>
                </div>
              )}
              {indicatorQuery.trim().length >= 2 && !selectedIndicator && (
                <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4, maxHeight: 240, overflowY: 'auto', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}>
                  {searching ? (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: '#B0BCD0' }}>Searching…</div>
                  ) : indicatorHits.length === 0 ? (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: '#B0BCD0' }}>No matches — you can still add a raw code.</div>
                  ) : indicatorHits.map(h => (
                    <button key={h.id} onClick={() => { setSelectedIndicator({ id: h.id, label: h.label || h.name || h.id }); setIndicatorHits([]) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, border: 'none', borderBottom: '1px solid #F0F4FA', background: '#fff', cursor: 'pointer' }}>
                      <span style={{ fontWeight: 600, color: '#0A1628' }}>{h.label || h.name || h.id}</span>
                      <span style={{ marginLeft: 6, color: '#B0BCD0', fontFamily: 'var(--font-mono, monospace)' }}>{h.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Country */}
            <input
              value={country}
              onChange={e => setCountry(e.target.value)}
              placeholder={source === 'imf' ? 'ISO3, e.g. USA,CHN,JPN' : 'ISO, e.g. US,CN,DE'}
              style={{ ...inputStyle, flex: '0 1 200px' }}
            />
            <button onClick={addImfOrWb} style={addBtnStyle}>+ Add to chart</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={seriesIdInput}
              onChange={e => setSeriesIdInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addDbnomics() }}
              placeholder="DBnomics series id — provider/dataset/series (e.g. IMF/WEO:latest/USA.NGDP_RPCH)"
              style={{ ...inputStyle, flex: '1 1 380px', minWidth: 260, fontFamily: 'var(--font-mono, monospace)' }}
            />
            <button onClick={() => addDbnomics()} style={addBtnStyle}>+ Add to chart</button>
          </div>
        )}

        {/* Featured chips */}
        {featured.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#B0BCD0', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              {source === 'dbnomics' ? 'Example series' : 'Featured indicators'}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {featured.map(f => (
                <button key={f.id}
                  onClick={() => {
                    if (source === 'dbnomics') { setSeriesIdInput(f.id); addDbnomics(f.id) }
                    else { setSelectedIndicator({ id: f.id, label: f.name }); setIndicatorQuery(f.name) }
                  }}
                  title={f.id}
                  style={{ padding: '4px 10px', borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', color: '#4A5568' }}>
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Added series legend / chips */}
      {series.length > 0 && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #E2E8F2', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {series.map(s => (
            <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 16, fontSize: 11, fontWeight: 600, background: '#fff', border: '1px solid var(--border)', color: '#0A1628' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
              {s.label}
              {s.loading && <span style={{ color: '#B0BCD0', fontWeight: 500 }}>· loading…</span>}
              {s.error && <span style={{ color: 'var(--neg)', fontWeight: 500 }}>· {s.error}</span>}
              <button onClick={() => removeSeries(s.key)} aria-label="Remove series"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#B0BCD0', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
          <button onClick={clearAll} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', color: '#7D8FA9', fontSize: 11, fontWeight: 600 }}>Clear all</button>
        </div>
      )}

      {/* Chart */}
      <div style={{ padding: 16, height: 320 }}>
        {series.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#B0BCD0', fontSize: 13, textAlign: 'center', padding: '0 24px' }}>
            Search an indicator (or pick a featured one) and add it to compare countries and sources on a shared time axis.
          </div>
        ) : ready.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: anyLoading ? '#B0BCD0' : 'var(--neg)', fontSize: 13, textAlign: 'center', padding: '0 24px' }}>
            {anyLoading ? 'Loading series…' : 'No data available for the selected series. Try a different indicator, country, or source.'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={52} domain={['auto', 'auto']}
                tickFormatter={(v: number) => Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + 'k' : String(Number(v.toFixed(2)))} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {ready.map(s => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13,
  fontFamily: 'inherit', color: 'var(--text-primary)', background: '#fff', width: '100%', boxSizing: 'border-box',
}

const addBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff',
  fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto',
}

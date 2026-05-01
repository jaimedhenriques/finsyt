'use client'
import { useEffect, useState } from 'react'

interface Props {
  address?: string
  city?: string
  state?: string
  zip?: string
}

interface FipsMatch {
  state?: string
  county?: string
  tract?: string
  block?: string
  geoid?: string
  name?: string
  geoLevel?: string
}

interface GeocodeResult {
  matchedAddress?: string
  coordinates?: { x: number; y: number }
  geographies?: FipsMatch[]
  error?: string
}

interface DemographicsResult {
  rows?: Array<Record<string, string>>
  error?: string
}

function fmtMoney(n: number | null) {
  if (n == null || !isFinite(n)) return '—'
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
function fmtInt(n: number | null) {
  if (n == null || !isFinite(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function pickGeography(geos: FipsMatch[] | undefined, level: string): FipsMatch | undefined {
  if (!geos) return undefined
  const lower = level.toLowerCase()
  return geos.find(g => (g.geoLevel || '').toLowerCase().includes(lower))
}

export default function HQContext({ address, city, state, zip }: Props) {
  const oneline = [address, city, state, zip].filter(Boolean).join(', ')
  const hasAddress = oneline.length > 5

  const [geo, setGeo] = useState<GeocodeResult | null>(null)
  const [demo, setDemo] = useState<DemographicsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!hasAddress) return
    let cancelled = false
    setLoading(true); setErr(null); setGeo(null); setDemo(null)

    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/api/census/geocode?address=${encodeURIComponent(oneline)}`)
      .then(r => r.json())
      .then(async (g: GeocodeResult) => {
        if (cancelled) return
        if (g.error) { setErr(g.error); setLoading(false); return }
        setGeo(g)
        const tract = pickGeography(g.geographies, 'Census Tract') || pickGeography(g.geographies, 'tract')
        if (!tract?.state || !tract?.county || !tract?.tract) { setLoading(false); return }
        try {
          const url = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/api/census/aggregate?dataset=acs/acs5&vintage=2022` +
            `&get=NAME,B19013_001E,B01003_001E,B11001_001E,B25077_001E` +
            `&for=tract:${tract.tract}&in=${encodeURIComponent(`state:${tract.state} county:${tract.county}`)}`
          const r = await fetch(url)
          const d = await r.json()
          if (!cancelled) setDemo(d)
        } catch (e) {
          if (!cancelled) setErr((e as Error).message)
        } finally {
          if (!cancelled) setLoading(false)
        }
      })
      .catch(e => { if (!cancelled) { setErr((e as Error).message); setLoading(false) } })

    return () => { cancelled = true }
  }, [oneline, hasAddress])

  if (!hasAddress) {
    return (
      <div className="card" style={{ padding: 16, marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Headquarters Context</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>U.S. Census · ACS5</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          No registered HQ address available for this company.
        </p>
      </div>
    )
  }

  const tract = pickGeography(geo?.geographies, 'Census Tract') || pickGeography(geo?.geographies, 'tract')
  const county = pickGeography(geo?.geographies, 'Counties') || pickGeography(geo?.geographies, 'county')
  const stateGeo = pickGeography(geo?.geographies, 'States') || pickGeography(geo?.geographies, 'state')
  const cbsa = pickGeography(geo?.geographies, 'Metropolitan')

  const tractRow = demo?.rows?.[0] || {}
  const medianIncome = Number(tractRow['B19013_001E'])
  const population   = Number(tractRow['B01003_001E'])
  const households   = Number(tractRow['B11001_001E'])
  const homeValue    = Number(tractRow['B25077_001E'])

  return (
    <div className="card" style={{ padding: 16, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Headquarters Context</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{geo?.matchedAddress || oneline}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          U.S. Census · ACS5 2022
        </span>
      </div>

      {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Resolving HQ to FIPS geography…</div>}
      {err && !loading && <div style={{ fontSize: 12, color: 'var(--neg)' }}>Census geocoder error: {err}</div>}

      {!loading && !err && geo && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 12 }}>
            <FipsBlock label="State"   code={stateGeo?.state} name={stateGeo?.name} />
            <FipsBlock label="County"  code={county?.county ? `${county.state || ''}${county.county}` : undefined} name={county?.name} />
            <FipsBlock label="Tract"   code={tract?.tract}   name={tract?.name} />
            <FipsBlock label="CBSA"    code={cbsa?.geoid}    name={cbsa?.name} />
          </div>

          {tract && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <Stat label="Median household income" value={fmtMoney(medianIncome > 0 ? medianIncome : null)} sub="B19013_001E · tract" />
              <Stat label="Population"              value={fmtInt(population > 0 ? population : null)}    sub="B01003_001E · tract" />
              <Stat label="Households"              value={fmtInt(households > 0 ? households : null)}    sub="B11001_001E · tract" />
              <Stat label="Median home value"       value={fmtMoney(homeValue > 0 ? homeValue : null)}    sub="B25077_001E · tract" />
            </div>
          )}
          {!tract && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Geocoder matched the address but no Census tract was returned — tract-level demographics unavailable.
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FipsBlock({ label, code, name }: { label: string; code?: string; name?: string }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label} FIPS</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace', marginTop: 2 }}>{code || '—'}</div>
      {name && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</div>}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{sub}</div>}
    </div>
  )
}

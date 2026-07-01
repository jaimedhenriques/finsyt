'use client'
/**
 * Field Mapping Review UI
 * ────────────────────────
 * Lets data-team admins review and override the auto-mapped source fields
 * for each connection + domain.
 *
 * Route: /app/connectors/mappings?connectionId=xxx&domain=fundamentals
 *
 * Features:
 *   - Coverage bar showing % of canonical datapoints mapped
 *   - Per-row source field → canonical field selector
 *   - "Auto-map" (re-introspect) button
 *   - "Confirm Mapping" button (stamps confirmedAt)
 *   - Un-mapped canonical fields shown in amber
 */
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

const API = '/platform/api/connectors/mappings'

interface CanonicalField {
  key: string
  label: string
  type: string
  unit?: string
  required?: boolean
}

interface CoverageResult {
  covered: string[]
  uncovered: string[]
  pct: number
}

interface MappingData {
  connectionId: string
  domain: string
  fieldMap: Record<string, string>
  coverage: CoverageResult
  introspectedAt: string | null
  confirmedAt: string | null
  canonicalFields: CanonicalField[]
}

interface IntrospectResult {
  ok: boolean
  sourceFields: { name: string }[]
  fieldMap: Record<string, string>
  coverage: CoverageResult
  confidence: number
  introspectedAt: string
  confirmedAt: null
}

const DOMAINS = [
  'quotes', 'fundamentals', 'estimates', 'news',
  'filings', 'transcripts', 'macro', 'ownership', 'deals',
]

const DOMAIN_LABELS: Record<string, string> = {
  quotes: 'Quotes', fundamentals: 'Fundamentals', estimates: 'Estimates',
  news: 'News', filings: 'Filings', transcripts: 'Transcripts',
  macro: 'Macro', ownership: 'Ownership', deals: 'Deals',
}

function CoverageBar({ pct, covered, total }: { pct: number; covered: number; total: number }) {
  const color = pct >= 75 ? '#059669' : pct >= 40 ? '#D97706' : '#DC2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#E2E8F2', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 80, textAlign: 'right' }}>
        {covered}/{total} fields ({pct}%)
      </span>
    </div>
  )
}

export default function MappingsPage() {
  const [searchParams, setSearchParams] = useState<{ connectionId: string | null; domain: string | null }>({
    connectionId: null, domain: null,
  })
  const [data, setData] = useState<MappingData | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [introspecting, setIntrospecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [localMap, setLocalMap] = useState<Record<string, string>>({})
  const [sourceFields, setSourceFields] = useState<string[]>([])
  const [newSourceField, setNewSourceField] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search)
      setSearchParams({ connectionId: p.get('connectionId'), domain: p.get('domain') })
    }
  }, [])

  const { connectionId, domain } = searchParams

  const load = useCallback(async () => {
    if (!connectionId || !domain) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${API}/${connectionId}/${domain}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d: MappingData = await r.json()
      setData(d)
      setLocalMap(d.fieldMap)
      setSourceFields(Object.keys(d.fieldMap))
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [connectionId, domain])

  useEffect(() => { load() }, [load])

  async function introspect() {
    if (!connectionId || !domain) return
    setIntrospecting(true); setError(null); setSuccess(null)
    try {
      const r = await fetch(`${API}/${connectionId}/${domain}/introspect`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      const d: IntrospectResult = await r.json()
      if (!r.ok) throw new Error((d as unknown as { error: string }).error || `HTTP ${r.status}`)
      setLocalMap(d.fieldMap)
      setSourceFields(d.sourceFields.map(sf => sf.name))
      await load()
      setSuccess(`Auto-mapped ${Object.keys(d.fieldMap).length} fields (${d.coverage.pct}% coverage, confidence ${Math.round(d.confidence * 100)}%)`)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setIntrospecting(false)
      setTimeout(() => setSuccess(null), 5000)
    }
  }

  async function save(confirm = false) {
    if (!connectionId || !domain) return
    setSaving(true); setError(null); setSuccess(null)
    try {
      const r = await fetch(`${API}/${connectionId}/${domain}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fieldMap: localMap, confirm }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error((d as { error: string }).error || `HTTP ${r.status}`)
      await load()
      setSuccess(confirm ? '✓ Mapping confirmed and saved' : '✓ Draft saved')
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
      setTimeout(() => setSuccess(null), 4000)
    }
  }

  function setMapping(sourceField: string, canonicalKey: string) {
    setLocalMap(prev => {
      const next = { ...prev }
      if (!canonicalKey) {
        delete next[sourceField]
      } else {
        // Remove any existing mapping to this canonical key first.
        for (const [sf, ck] of Object.entries(next)) {
          if (ck === canonicalKey && sf !== sourceField) delete next[sf]
        }
        next[sourceField] = canonicalKey
      }
      return next
    })
  }

  function addSourceField() {
    const f = newSourceField.trim()
    if (!f || sourceFields.includes(f)) return
    setSourceFields(prev => [...prev, f])
    setNewSourceField('')
  }

  function removeMapping(sourceField: string) {
    setLocalMap(prev => { const next = { ...prev }; delete next[sourceField]; return next })
    setSourceFields(prev => prev.filter(s => s !== sourceField))
  }

  const localCoverage = data
    ? (() => {
        const covered = data.canonicalFields.filter(cf => Object.values(localMap).includes(cf.key))
        const uncovered = data.canonicalFields.filter(cf => !Object.values(localMap).includes(cf.key))
        return { covered: covered.map(c => c.key), uncovered: uncovered.map(c => c.key), pct: data.canonicalFields.length > 0 ? Math.round((covered.length / data.canonicalFields.length) * 100) : 0 }
      })()
    : null

  const hasChanges = data ? JSON.stringify(localMap) !== JSON.stringify(data.fieldMap) : false

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page, #F7F9FC)', padding: '0 0 60px' }}>
      {/* Header */}
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid #E2E8F2', background: '#fff', display: 'flex', alignItems: 'center', gap: 16 }}>
        <Link href="/app/connectors" style={{ fontSize: 13, color: '#1B4FFF', fontWeight: 600, textDecoration: 'none' }}>
          ← Connector Hub
        </Link>
        <span style={{ color: '#B0BCD0' }}>/</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#0A1628' }}>Field Mapping Review</span>
        {domain && (
          <>
            <span style={{ color: '#B0BCD0' }}>/</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#4A5568', textTransform: 'capitalize' }}>{DOMAIN_LABELS[domain] ?? domain}</span>
          </>
        )}
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 32px' }}>
        {/* Connection + Domain picker */}
        {(!connectionId || !domain) && (
          <div className="card" style={{ padding: 24 }}>
            <h2 style={{ fontWeight: 800, fontSize: 16, color: '#0A1628', marginBottom: 8 }}>Select a Connection &amp; Domain</h2>
            <p style={{ fontSize: 13, color: '#7D8FA9', marginBottom: 16, lineHeight: 1.6 }}>
              Navigate here from the Connector Hub (My Connections → Field Mapping) or paste
              a direct URL: <code>/app/connectors/mappings?connectionId=&lt;id&gt;&amp;domain=&lt;domain&gt;</code>
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {DOMAINS.map(d => (
                <span key={d} style={{ padding: '4px 12px', borderRadius: 20, background: 'rgba(27,79,255,0.08)', color: '#1B4FFF', fontSize: 12, fontWeight: 600 }}>
                  {DOMAIN_LABELS[d]}
                </span>
              ))}
            </div>
          </div>
        )}

        {connectionId && domain && (
          <>
            {loading && <div style={{ padding: 24, fontSize: 13, color: '#7D8FA9' }}>Loading mapping…</div>}
            {error && (
              <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', color: '#DC2626', fontSize: 13, marginBottom: 16 }}>
                ⚠ {error}
              </div>
            )}
            {success && (
              <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.2)', color: '#059669', fontSize: 13, marginBottom: 16 }}>
                {success}
              </div>
            )}

            {data && (
              <>
                {/* Coverage summary */}
                <div className="card" style={{ padding: 20, marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#0A1628', marginBottom: 4 }}>
                        Coverage — {DOMAIN_LABELS[domain] ?? domain}
                      </div>
                      <div style={{ fontSize: 12, color: '#7D8FA9' }}>
                        {localCoverage && localCoverage.pct < 100 && (
                          <span>Uncovered fields will be absent from the page — no Finsyt backfill.</span>
                        )}
                        {localCoverage && localCoverage.pct === 100 && (
                          <span style={{ color: '#059669' }}>All canonical fields are mapped.</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {data.confirmedAt && !hasChanges && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(5,150,105,0.08)', color: '#059669' }}>
                          ✓ Confirmed {new Date(data.confirmedAt).toLocaleDateString()}
                        </span>
                      )}
                      {data.introspectedAt && (
                        <span style={{ fontSize: 11, color: '#B0BCD0' }}>
                          Introspected {new Date(data.introspectedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {localCoverage && (
                    <CoverageBar pct={localCoverage.pct} covered={localCoverage.covered.length} total={data.canonicalFields.length} />
                  )}
                </div>

                {/* Toolbar */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={introspect} disabled={introspecting || saving}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #1B4FFF', background: '#fff', color: '#1B4FFF', fontSize: 13, fontWeight: 700, cursor: introspecting ? 'wait' : 'pointer', opacity: introspecting ? 0.7 : 1 }}>
                    {introspecting ? '⟳ Auto-mapping…' : '⟳ Auto-map from Source'}
                  </button>
                  {hasChanges && (
                    <button onClick={() => save(false)} disabled={saving}
                      style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #D97706', background: 'rgba(217,119,6,0.06)', color: '#D97706', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
                      {saving ? 'Saving…' : 'Save Draft'}
                    </button>
                  )}
                  <button onClick={() => save(true)} disabled={saving}
                    style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, marginLeft: 'auto' }}>
                    {saving ? 'Confirming…' : '✓ Confirm Mapping'}
                  </button>
                </div>

                {/* Mapped fields table */}
                <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #F0F4FA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#0A1628' }}>Source → Canonical Mapping</div>
                    <div style={{ fontSize: 11, color: '#7D8FA9' }}>{sourceFields.length} source fields</div>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #F0F4FA' }}>
                        <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#7D8FA9', width: '38%' }}>Source Field</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#7D8FA9', width: 32 }}>→</th>
                        <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#7D8FA9' }}>Canonical Datapoint</th>
                        <th style={{ padding: '10px 20px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#7D8FA9', width: 60 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sourceFields.map((sf, i) => {
                        const mapped = localMap[sf]
                        const canonical = data.canonicalFields.find(c => c.key === mapped)
                        return (
                          <tr key={sf} style={{ borderBottom: i < sourceFields.length - 1 ? '1px solid #F0F4FA' : 'none' }}>
                            <td style={{ padding: '10px 20px' }}>
                              <code style={{ fontSize: 12, fontFamily: 'monospace', color: '#0A1628', background: '#F8FAFD', padding: '2px 6px', borderRadius: 4 }}>{sf}</code>
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', color: '#B0BCD0', fontSize: 16 }}>→</td>
                            <td style={{ padding: '10px 20px' }}>
                              <select
                                value={mapped ?? ''}
                                onChange={e => setMapping(sf, e.target.value)}
                                style={{ padding: '6px 10px', borderRadius: 6, border: `1.5px solid ${mapped ? '#E2E8F2' : '#D97706'}`, fontSize: 12, fontFamily: 'inherit', background: '#fff', color: '#0A1628', cursor: 'pointer', width: '100%', maxWidth: 320 }}>
                                <option value="">— Not mapped —</option>
                                {data.canonicalFields.map(cf => (
                                  <option key={cf.key} value={cf.key}>
                                    {cf.label} ({cf.key}){cf.required ? ' *' : ''}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                              <button onClick={() => removeMapping(sf)} title="Remove"
                                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(220,38,38,0.2)', background: 'rgba(220,38,38,0.04)', color: '#DC2626', fontSize: 11, cursor: 'pointer' }}>
                                ✕
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {/* Add source field row */}
                  <div style={{ padding: '12px 20px', borderTop: '1px solid #F0F4FA', display: 'flex', gap: 8 }}>
                    <input
                      value={newSourceField}
                      onChange={e => setNewSourceField(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addSourceField() }}
                      placeholder="Add source field name…"
                      style={{ flex: 1, padding: '7px 12px', borderRadius: 7, border: '1.5px solid #E2E8F2', fontSize: 12, fontFamily: 'monospace', outline: 'none', background: '#fff', color: '#0A1628' }}
                    />
                    <button onClick={addSourceField}
                      style={{ padding: '7px 14px', borderRadius: 7, border: '1.5px solid #E2E8F2', background: '#fff', color: '#4A5568', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      + Add
                    </button>
                  </div>
                </div>

                {/* Uncovered canonical fields */}
                {localCoverage && localCoverage.uncovered.length > 0 && (
                  <div className="card" style={{ padding: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#D97706', marginBottom: 10 }}>
                      ⚠ {localCoverage.uncovered.length} canonical fields not covered
                    </div>
                    <div style={{ fontSize: 12, color: '#7D8FA9', marginBottom: 12, lineHeight: 1.6 }}>
                      These fields will be absent from the page. If your source provides them under a different name, add a mapping above.
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {localCoverage.uncovered.map(key => {
                        const cf = data.canonicalFields.find(c => c.key === key)!
                        return (
                          <span key={key} style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(217,119,6,0.08)', color: '#D97706', fontSize: 11, fontWeight: 600 }}>
                            {cf?.label ?? key}{cf?.required ? ' *' : ''}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

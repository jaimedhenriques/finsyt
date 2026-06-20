'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'

const API = '/platform/api'

// ── qualitate.io–inspired palette ─────────────────────────────────────────────
const Q = {
  bg:       '#FFFFFF',
  surface:  '#F7F8FA',
  card:     '#FFFFFF',
  border:   '#E5E8EE',
  borderS:  '#EEF1F5',
  text:     '#0A1628',
  textMute: '#5A6A82',
  textDim:  '#8A99B0',
  navy:     '#0A2540',
  navy2:    '#163A6A',
  accent:   '#0035E5',
  ok:       '#0E9F6E',
  warn:     '#C2710C',
  err:      '#C53030',
  okBg:     '#ECFDF5',
  warnBg:   '#FEF6E7',
  errBg:    '#FEF2F2',
}

interface ProviderRow {
  name: string
  configured: boolean
  health: {
    ok: boolean
    status?: number
    ms?: number
    skipped?: boolean
    error?: string
    sample?: string | null
    lastSuccessAt?: string | null
    rateLimit?: Record<string, string>
  }
  meta: null | {
    label: string
    category: string
    tier: string
    coverage: string
    fields: string[]
    docs: string
    envName: string
  }
}
interface HealthResponse {
  summary:    { total: number; configured: number; healthy: number; failing: number }
  providers:  ProviderRow[]
  generatedAt: string
}

interface SchemaStatus {
  inSync: boolean
  statementCount: number
  statements: string[]
  hasDataLoss: boolean
  warnings: string[]
  generatedAt: string
}

const TIER_ORDER: readonly string[] = ['primary', 'secondary', 'fallback', 'specialty']
const CATEGORY_LABEL: Record<string, string> = {
  fundamentals:'Fundamentals', quotes:'Market Data', news:'News & Sentiment',
  macro:'Macro Data', alt:'Alternative', ai:'AI / LLM', private:'Private Co.', design:'Design',
}

function StatusPill({ row }: { row: ProviderRow }) {
  let bg = Q.errBg, fg = Q.err, label = 'OFFLINE'
  if (!row.configured)         { bg = Q.surface; fg = Q.textDim;  label = 'NOT CONFIGURED' }
  else if (row.health.skipped) { bg = Q.surface; fg = Q.textMute; label = 'NO PROBE' }
  else if (row.health.ok)      { bg = Q.okBg;    fg = Q.ok;       label = 'HEALTHY' }
  else                         { bg = Q.errBg;   fg = Q.err;      label = `HTTP ${row.health.status || 'ERR'}` }
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:6, padding:'3px 10px',
      borderRadius:999, background:bg, color:fg, fontSize:11, fontWeight:600,
      letterSpacing:'.04em', textTransform:'uppercase',
    }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:fg }} />
      {label}
    </span>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    primary:   { bg:'#0A254010', fg:Q.navy },
    secondary: { bg:'#0035E512', fg:Q.accent },
    fallback:  { bg:'#5A6A8210', fg:Q.textMute },
    specialty: { bg:'#C2710C12', fg:Q.warn },
  }
  const c = map[tier] || map.fallback
  return (
    <span style={{
      padding:'2px 8px', borderRadius:6, background:c.bg, color:c.fg,
      fontSize:10, fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase',
    }}>
      {tier}
    </span>
  )
}

function SchemaStatusCard({
  schema, loading, error, onRefresh,
}: {
  schema: SchemaStatus | null
  loading: boolean
  error: string | null
  onRefresh: () => void
}) {
  // Tone: neutral while loading/erroring, green in sync, red/amber on drift.
  let bg = Q.surface, border = Q.borderS, fg = Q.textMute, dot = Q.textDim
  let title = 'Checking schema…'
  let detail = 'Comparing the live database against the Drizzle schema.'

  if (error) {
    bg = Q.errBg; border = '#F5C2C2'; fg = Q.err; dot = Q.err
    title = 'Schema check unavailable'
    detail = error
  } else if (schema) {
    if (schema.inSync) {
      bg = Q.okBg; border = '#BDEBD6'; fg = Q.ok; dot = Q.ok
      title = 'Schema in sync'
      detail = 'The live database matches the Drizzle schema. No migration needed.'
    } else {
      const danger = schema.hasDataLoss
      bg = danger ? Q.errBg : Q.warnBg
      border = danger ? '#F5C2C2' : '#F2DCA8'
      fg = danger ? Q.err : Q.warn
      dot = fg
      title = 'Schema drift detected'
      detail = `${schema.statementCount} statement${schema.statementCount === 1 ? '' : 's'} would be required to reconcile the database`
        + (danger ? ' — some may cause data loss.' : '.')
    }
  }

  return (
    <div style={{
      marginTop:20, maxWidth:880, background:bg, border:`1px solid ${border}`,
      borderRadius:10, padding:'16px 18px',
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{
            width:8, height:8, borderRadius:'50%', background:dot,
            boxShadow: loading ? 'none' : `0 0 0 3px ${dot}22`,
          }} />
          <span style={{ fontSize:14, fontWeight:600, color:fg }}>{title}</span>
        </div>
        <button onClick={onRefresh} disabled={loading} style={{
          padding:'5px 12px', borderRadius:999, border:`1px solid ${Q.border}`,
          background:'#fff', color:Q.text, fontSize:12, fontWeight:500,
          cursor: loading ? 'wait' : 'pointer', opacity: loading ? .6 : 1,
        }}>
          {loading ? 'Checking…' : 'Re-check'}
        </button>
      </div>
      <p style={{ margin:'8px 0 0', fontSize:13, color:Q.textMute, lineHeight:1.5 }}>{detail}</p>

      {schema && !schema.inSync && schema.statements.length > 0 && (
        <details style={{ marginTop:10 }}>
          <summary style={{ cursor:'pointer', fontSize:12, color:Q.textDim }}>
            Pending statements ({schema.statementCount})
          </summary>
          <pre style={{
            marginTop:8, padding:12, background:'#fff', border:`1px solid ${Q.borderS}`,
            borderRadius:8, fontSize:11, lineHeight:1.5, color:Q.text,
            overflowX:'auto', whiteSpace:'pre-wrap', wordBreak:'break-word',
            fontFamily:"'JetBrains Mono', ui-monospace, monospace",
          }}>
            {schema.statements.map(s => s.replace(/\s+/g, ' ').trim()).join('\n')}
          </pre>
        </details>
      )}

      {schema && schema.generatedAt && !error && (
        <div style={{ marginTop:8, fontSize:11, color:Q.textDim }}>
          Checked {new Date(schema.generatedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}

export default function ProvidersAdminClient() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [filter, setFilter]   = useState<'all'|'configured'|'missing'|'failing'>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [probing, setProbing]       = useState<Set<string>>(new Set())
  const [schema, setSchema]         = useState<SchemaStatus | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(true)
  const [schemaError, setSchemaError]     = useState<string | null>(null)

  const probeOne = useCallback(async (provider: string) => {
    setProbing(prev => new Set(prev).add(provider))
    try {
      const r = await fetch(`${API}/admin/providers/health`, {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const updated = await r.json() as ProviderRow
      setData(prev => prev ? {
        ...prev,
        providers: prev.providers.map(p => p.name === provider ? { ...p, ...updated } : p),
        generatedAt: new Date().toISOString(),
      } : prev)
    } catch (e) {
      console.error('[providers] probe failed', e)
    } finally {
      setProbing(prev => { const n = new Set(prev); n.delete(provider); return n })
    }
  }, [])

  const load = useCallback(async () => {
    setRefreshing(true); setError(null)
    try {
      const r = await fetch(`${API}/admin/providers/health`, { cache:'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = await r.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [])

  const loadSchema = useCallback(async () => {
    setSchemaLoading(true); setSchemaError(null)
    try {
      const r = await fetch(`${API}/admin/schema-status`, { cache:'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = await r.json() as SchemaStatus
      setSchema(json)
    } catch (e) {
      setSchemaError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setSchemaLoading(false)
    }
  }, [])

  useEffect(() => { load(); loadSchema() }, [load, loadSchema])

  const grouped = useMemo(() => {
    if (!data) return [] as Array<{ category: string; rows: ProviderRow[] }>
    const rows = data.providers.filter(p => {
      if (filter === 'configured') return p.configured
      if (filter === 'missing')    return !p.configured
      if (filter === 'failing')    return p.configured && !p.health.ok && !p.health.skipped
      return true
    })
    const byCat = new Map<string, ProviderRow[]>()
    rows.forEach(r => {
      const cat = r.meta?.category || 'other'
      if (!byCat.has(cat)) byCat.set(cat, [])
      byCat.get(cat)!.push(r)
    })
    byCat.forEach(arr => arr.sort((a, b) => {
      const ta = TIER_ORDER.indexOf(a.meta?.tier ?? 'fallback')
      const tb = TIER_ORDER.indexOf(b.meta?.tier ?? 'fallback')
      return ta - tb || a.name.localeCompare(b.name)
    }))
    const orderedCats = ['fundamentals','quotes','news','macro','private','ai','design','alt','other']
    return orderedCats.filter(c => byCat.has(c)).map(c => ({ category:c, rows: byCat.get(c)! }))
  }, [data, filter])

  return (
    <div style={{
      background:Q.bg, color:Q.text, minHeight:'100vh',
      fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
    }}>
      {/* ── Page header (qualitate-style) ──────────────────────────────── */}
      <header style={{ padding:'48px 56px 32px', borderBottom:`1px solid ${Q.borderS}` }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.18em', color:Q.textMute, textTransform:'uppercase' }}>
          The Platform · Data Infrastructure
        </div>
        <h1 style={{
          margin:'12px 0 14px', fontSize:42, lineHeight:1.08, fontWeight:600,
          color:Q.navy, letterSpacing:'-.02em', maxWidth:780,
        }}>
          Provider Health
        </h1>
        <p style={{ margin:0, fontSize:16, color:Q.textMute, lineHeight:1.55, maxWidth:680 }}>
          Every market-data, fundamentals, macro and AI source the Finsyt platform pulls from — with live latency,
          coverage, and the exact fields each one contributes to research, screeners and the agent.
        </p>

        {/* Summary tiles */}
        {data && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16, marginTop:36, maxWidth:880 }}>
            {[
              { k:'total',      label:'Total sources', val: data.summary.total,      tone: Q.navy },
              { k:'configured', label:'Configured',    val: data.summary.configured, tone: Q.accent },
              { k:'healthy',    label:'Healthy',       val: data.summary.healthy,    tone: Q.ok },
              { k:'failing',    label:'Failing',       val: data.summary.failing,    tone: data.summary.failing > 0 ? Q.err : Q.textDim },
            ].map(t => (
              <div key={t.k} style={{
                background:Q.surface, border:`1px solid ${Q.borderS}`, borderRadius:10,
                padding:'18px 18px 16px',
              }}>
                <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', color:Q.textMute, textTransform:'uppercase' }}>
                  {t.label}
                </div>
                <div style={{ marginTop:8, fontSize:32, fontWeight:600, color:t.tone, letterSpacing:'-.02em' }}>
                  {t.val}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Schema drift indicator */}
        <SchemaStatusCard
          schema={schema}
          loading={schemaLoading}
          error={schemaError}
          onRefresh={loadSchema}
        />
      </header>

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        padding:'20px 56px', borderBottom:`1px solid ${Q.borderS}`, background:Q.bg,
        position:'sticky', top:0, zIndex:5,
      }}>
        <div style={{ display:'flex', gap:6 }}>
          {(['all','configured','missing','failing'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding:'8px 14px', borderRadius:8, fontSize:13, fontWeight:500,
              cursor:'pointer', border:`1px solid ${filter === f ? Q.navy : Q.border}`,
              background: filter === f ? Q.navy : Q.bg,
              color: filter === f ? '#fff' : Q.text, transition:'all .15s',
            }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          {data && (
            <span style={{ fontSize:12, color:Q.textDim }}>
              Updated {new Date(data.generatedAt).toLocaleTimeString()}
            </span>
          )}
          <button onClick={load} disabled={refreshing} style={{
            padding:'8px 18px', borderRadius:999, border:'none',
            background: Q.navy, color:'#fff', fontSize:13, fontWeight:500,
            cursor: refreshing ? 'wait' : 'pointer', opacity: refreshing ? .6 : 1,
          }}>
            {refreshing ? 'Re-probing…' : 'Refresh probes'}
          </button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <main style={{ padding:'40px 56px 80px' }}>
        {loading && <div style={{ color:Q.textMute }}>Loading provider health…</div>}
        {error   && <div style={{ color:Q.err, padding:14, background:Q.errBg, borderRadius:8 }}>{error}</div>}

        {grouped.map(group => (
          <section key={group.category} style={{ marginBottom:48 }}>
            <div style={{ marginBottom:18, display:'flex', alignItems:'baseline', gap:14 }}>
              <h2 style={{ margin:0, fontSize:22, fontWeight:600, color:Q.navy, letterSpacing:'-.01em' }}>
                {CATEGORY_LABEL[group.category] || group.category}
              </h2>
              <span style={{ fontSize:13, color:Q.textDim }}>
                {group.rows.filter(r => r.configured).length} of {group.rows.length} configured
              </span>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(380px, 1fr))', gap:16 }}>
              {group.rows.map(row => (
                <article key={row.name} style={{
                  background:Q.card, border:`1px solid ${row.configured && row.health.ok ? '#D6E4FF' : Q.border}`,
                  borderRadius:12, padding:'20px 22px', display:'flex', flexDirection:'column', gap:14,
                  boxShadow: row.configured && row.health.ok ? '0 1px 3px rgba(10,37,64,0.04)' : 'none',
                }}>
                  <header style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <h3 style={{ margin:0, fontSize:17, fontWeight:600, color:Q.navy }}>
                          {row.meta?.label || row.name}
                        </h3>
                        {row.meta?.tier && <TierBadge tier={row.meta.tier} />}
                      </div>
                      <code style={{
                        marginTop:6, display:'inline-block', fontSize:11, color:Q.textDim,
                        fontFamily:"'JetBrains Mono', ui-monospace, monospace",
                      }}>
                        {row.meta?.envName || row.name}
                      </code>
                    </div>
                    <StatusPill row={row} />
                  </header>

                  {row.meta?.coverage && (
                    <p style={{ margin:0, fontSize:13, color:Q.text, lineHeight:1.5 }}>
                      {row.meta.coverage}
                    </p>
                  )}

                  {row.meta?.fields && row.meta.fields.length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                      {row.meta.fields.slice(0, 12).map(f => (
                        <span key={f} style={{
                          padding:'3px 8px', borderRadius:5, background:Q.surface,
                          fontSize:11, color:Q.textMute, border:`1px solid ${Q.borderS}`,
                        }}>{f}</span>
                      ))}
                    </div>
                  )}

                  {/* Operational stats */}
                  {row.configured && (
                    <div style={{
                      display:'grid', gridTemplateColumns:'1fr 1fr', gap:6,
                      fontSize:11, color:Q.textMute,
                    }}>
                      {row.health.ms !== undefined && (
                        <div><span style={{ color:Q.textDim }}>Latency</span> · {row.health.ms} ms</div>
                      )}
                      {row.health.lastSuccessAt && (
                        <div><span style={{ color:Q.textDim }}>Last OK</span> · {new Date(row.health.lastSuccessAt).toLocaleTimeString()}</div>
                      )}
                      {row.health.rateLimit && Object.entries(row.health.rateLimit).slice(0, 2).map(([k, v]) => (
                        <div key={k}><span style={{ color:Q.textDim }}>{k.replace(/^x-/, '')}</span> · {v}</div>
                      ))}
                    </div>
                  )}

                  <div style={{
                    marginTop:'auto', paddingTop:12, borderTop:`1px dashed ${Q.borderS}`,
                    display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12,
                  }}>
                    <span style={{ color:Q.textDim }}>
                      {row.configured
                        ? <span style={{ color:Q.ok }}>● Key configured</span>
                        : <span style={{ color:Q.warn }}>Add via Secret Manager</span>}
                    </span>
                    <span style={{ display:'flex', alignItems:'center', gap:10 }}>
                      {row.configured && (
                        <button
                          type="button"
                          onClick={() => probeOne(row.name)}
                          disabled={probing.has(row.name)}
                          style={{
                            padding:'4px 10px', borderRadius:999, border:`1px solid ${Q.border}`,
                            background:'#fff', color:Q.text, fontSize:11, fontWeight:500,
                            cursor: probing.has(row.name) ? 'wait' : 'pointer',
                            opacity: probing.has(row.name) ? .55 : 1,
                          }}
                          title={`Re-probe ${row.meta?.label ?? row.name}`}
                        >
                          {probing.has(row.name) ? 'Probing…' : 'Probe'}
                        </button>
                      )}
                      {row.meta?.docs && (
                        <a href={row.meta.docs} target="_blank" rel="noreferrer" style={{
                          color:Q.accent, textDecoration:'none', fontWeight:500,
                        }}>
                          Docs →
                        </a>
                      )}
                    </span>
                  </div>

                  {row.health.error && (
                    <div style={{
                      fontSize:11, color:Q.err, background:Q.errBg, padding:'6px 8px',
                      borderRadius:6, fontFamily:"'JetBrains Mono', ui-monospace, monospace",
                    }}>
                      {row.health.error}
                    </div>
                  )}

                  {row.health.sample && !row.health.ok && (
                    <details style={{ fontSize:11 }}>
                      <summary style={{ cursor:'pointer', color:Q.textDim }}>Last response preview</summary>
                      <pre style={{
                        marginTop:6, padding:'8px 10px', background:Q.surface,
                        borderRadius:6, color:Q.textMute, whiteSpace:'pre-wrap',
                        wordBreak:'break-word', fontFamily:"'JetBrains Mono', ui-monospace, monospace",
                      }}>{row.health.sample}</pre>
                    </details>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}

        {/* Footer note */}
        <div style={{
          marginTop:60, padding:'24px 28px', background:Q.surface, borderRadius:12,
          border:`1px solid ${Q.borderS}`, fontSize:13, color:Q.textMute, lineHeight:1.6,
        }}>
          <strong style={{ color:Q.navy, fontWeight:600 }}>Adding or rotating a key:</strong>{' '}
          open the Secret Manager and use the <code style={{ color:Q.text }}>envName</code> shown on each card.
          The platform will pick up the new value on the next request — no redeploy required.
        </div>
      </main>
    </div>
  )
}

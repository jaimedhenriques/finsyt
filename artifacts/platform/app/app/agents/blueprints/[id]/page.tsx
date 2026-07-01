'use client'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHero } from '@/components/ui'
import { apiUrl } from '@/lib/api-url'

// ── Blueprint editor / runner ───────────────────────────────────────────────
// One screen for: viewing a Blueprint, editing it (workspace rows only),
// supplying parameters, kicking off a run, and showing the streaming results.
// Curated `published` rows render in read-only mode but expose the same
// "Run Blueprint" form on the right.

type ParamType = 'text' | 'longtext' | 'ticker' | 'tickers' | 'select' | 'number' | 'date'
type Visibility = 'private' | 'team' | 'firm' | 'published'

interface BlueprintParameter {
  key: string
  label: string
  type: ParamType
  required?: boolean
  defaultValue?: string | number | string[]
  options?: string[]
  helpText?: string
}
interface BlueprintStep {
  id: string
  title: string
  category?: string
  prompt: string
  outputKey?: string
  notes?: string
}
interface BlueprintExpectedOutput { key: string; label: string; description?: string }

interface Blueprint {
  id: string
  slug: string
  name: string
  description: string
  category: string
  icon: string
  visibility: Visibility
  version: number
  parameters: BlueprintParameter[]
  steps: BlueprintStep[]
  expectedOutputs: BlueprintExpectedOutput[]
  requiredTools: string[]
  requiredConnectors: string[]
  isPublished: boolean
  authorUserId: string
  updatedAt: string
}

interface RunStepResult {
  stepId: string
  title: string
  headline: string
  summary: string
  findings: { title: string; detail: string }[]
  sources: { label: string; meta: string }[]
  ok: boolean
  errorMessage?: string
  latencyMs: number
}
interface RunResult {
  runId: string
  status: 'ok' | 'error'
  stepResults: RunStepResult[]
  finalOutput: RunStepResult | null
  pinnedNoteId: string | null
  totalLatencyMs: number
  errorMessage?: string
}

const CATEGORIES = ['Monitoring', 'Research', 'Competitive', 'Earnings', 'Macro', 'Diligence', 'M&A', 'Outreach']

export default function BlueprintDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id

  const [bp, setBp] = useState<Blueprint | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Blueprint | null>(null)
  const [saving, setSaving] = useState(false)

  // Per-run state.
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState<RunResult | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(apiUrl(`/api/blueprints/${id}`), { cache: 'no-store' })
      .then(async (r) => {
        const ct = r.headers.get('content-type') || ''
        if (!ct.includes('application/json')) {
          throw new Error(`Server returned ${r.status} (non-JSON response)`)
        }
        const data = await r.json()
        if (!r.ok || data.error) { setError(data?.error || `HTTP ${r.status}`); return }
        setBp(data.blueprint)
        // Pre-populate defaults so a single click can run.
        const initial: Record<string, string> = {}
        for (const p of data.blueprint.parameters as BlueprintParameter[]) {
          if (p.defaultValue !== undefined) {
            initial[p.key] = Array.isArray(p.defaultValue) ? p.defaultValue.join(', ') : String(p.defaultValue)
          }
        }
        setParamValues(initial)
      })
      .catch((e: Error) => setError(e.message))
  }, [id])

  const editable = !!bp && !bp.isPublished

  const startEdit = useCallback(() => {
    if (!bp) return
    setDraft(JSON.parse(JSON.stringify(bp)))
    setEditing(true)
  }, [bp])

  const cancelEdit = useCallback(() => { setDraft(null); setEditing(false) }, [])

  const save = useCallback(async () => {
    if (!draft || !bp) return
    setSaving(true)
    try {
      const r = await fetch(apiUrl(`/api/blueprints/${bp.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          category: draft.category,
          icon: draft.icon,
          visibility: draft.visibility === 'published' ? 'firm' : draft.visibility,
          parameters: draft.parameters,
          steps: draft.steps,
          expectedOutputs: draft.expectedOutputs,
          requiredTools: draft.requiredTools,
          requiredConnectors: draft.requiredConnectors,
        }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data?.error || 'save failed'); return }
      setBp(data.blueprint)
      setEditing(false)
      setDraft(null)
    } finally { setSaving(false) }
  }, [draft, bp])

  const runBp = useCallback(async () => {
    if (!bp) return
    setRunning(true); setRun(null); setError(null)
    try {
      // Parse free-text param input back into the typed shape the API expects.
      const params: Record<string, string | number | string[]> = {}
      for (const p of bp.parameters) {
        const raw = (paramValues[p.key] ?? '').trim()
        if (!raw) continue
        if (p.type === 'tickers') params[p.key] = raw.split(/[\s,]+/).filter(Boolean)
        else if (p.type === 'number') params[p.key] = Number(raw)
        else params[p.key] = raw
      }
      const r = await fetch(apiUrl('/api/blueprints/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintId: bp.id, parameters: params }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data?.error || 'run failed'); return }
      setRun(data.run)
    } catch (e) { setError((e as Error).message) }
    finally { setRunning(false) }
  }, [bp, paramValues])

  const remove = useCallback(async () => {
    if (!bp || bp.isPublished) return
    if (!confirm(`Delete Blueprint "${bp.name}"? This cannot be undone.`)) return
    const r = await fetch(apiUrl(`/api/blueprints/${bp.id}`), { method: 'DELETE' })
    if (r.ok) router.push('/app/agents/library')
  }, [bp, router])

  if (error && !bp) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Blueprint unavailable</div>
        <div style={{ fontSize: 13, marginBottom: 14 }}>{error}</div>
        <Link href="/app/agents/library" style={{ color: 'var(--accent-text)' }}>← Back to library</Link>
      </div>
    )
  }
  if (!bp) {
    return <div style={{ padding: 48, color: 'var(--text-muted)', textAlign: 'center' }}>Loading Blueprint…</div>
  }

  const view = editing && draft ? draft : bp
  const update = (patch: Partial<Blueprint>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  return (
    <div style={{ color: 'var(--text-primary)', maxWidth: 1280, margin: '0 auto' }}>
      <PageHero
        eyebrow={
          <Link href="/app/agents/library" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 12 }}>
            ← Blueprint Library
          </Link>
        }
        title={view.name}
        subtitle={view.description}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {!editing && editable && (
              <>
                <button onClick={startEdit} style={ghostBtn}>✎ Edit</button>
                <button onClick={remove} style={dangerBtn}>Delete</button>
              </>
            )}
            {editing && (
              <>
                <button onClick={cancelEdit} style={ghostBtn} disabled={saving}>Cancel</button>
                <button onClick={save} style={primaryBtn} disabled={saving}>{saving ? 'Saving…' : 'Save (bumps to v' + (bp.version + 1) + ')'}</button>
              </>
            )}
          </div>
        }
      />

      <div style={{ padding: '0 32px 64px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 24 }}>
        {/* Left column — definition / steps / outputs */}
        <div>
          <Card>
            <SectionLabel>Metadata</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Name">
                {editing ? (
                  <input value={view.name} onChange={(e) => update({ name: e.target.value })} style={inputStyle} />
                ) : <Readonly>{view.name}</Readonly>}
              </Field>
              <Field label="Category">
                {editing ? (
                  <select value={view.category} onChange={(e) => update({ category: e.target.value })} style={inputStyle}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : <Readonly>{view.category}</Readonly>}
              </Field>
              <Field label="Visibility">
                {editing ? (
                  <select value={view.visibility} onChange={(e) => update({ visibility: e.target.value as Visibility })} style={inputStyle}>
                    <option value="private">Private (just me)</option>
                    <option value="team">Team</option>
                    <option value="firm">Firm (every workspace member)</option>
                  </select>
                ) : <Readonly>{view.isPublished ? 'Curated · published library' : view.visibility}</Readonly>}
              </Field>
              <Field label="Version">
                <Readonly>v{view.version} · updated {new Date(view.updatedAt).toLocaleString()}</Readonly>
              </Field>
              <Field label="Description" full>
                {editing ? (
                  <textarea value={view.description} onChange={(e) => update({ description: e.target.value })} style={{ ...inputStyle, minHeight: 80 }} />
                ) : <Readonly>{view.description}</Readonly>}
              </Field>
            </div>
          </Card>

          <Card>
            <SectionLabel>Parameters · {view.parameters.length}</SectionLabel>
            <ParameterEditor
              params={view.parameters}
              editing={editing}
              onChange={(parameters) => update({ parameters })}
            />
          </Card>

          <Card>
            <SectionLabel>Steps · {view.steps.length}</SectionLabel>
            <StepEditor
              steps={view.steps}
              editing={editing}
              onChange={(steps) => update({ steps })}
            />
          </Card>

          <Card>
            <SectionLabel>Expected outputs</SectionLabel>
            <OutputsEditor
              outputs={view.expectedOutputs}
              editing={editing}
              onChange={(expectedOutputs) => update({ expectedOutputs })}
            />
            {view.requiredTools.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <SectionLabel>Required tools</SectionLabel>
                <ChipList items={view.requiredTools} />
              </div>
            )}
            {view.requiredConnectors.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <SectionLabel>Required connectors</SectionLabel>
                <ChipList items={view.requiredConnectors} />
              </div>
            )}
          </Card>
        </div>

        {/* Right column — run panel */}
        <div>
          <div style={{ position: 'sticky', top: 16 }}>
            <Card>
              <SectionLabel>Run this Blueprint</SectionLabel>
              {bp.parameters.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>This Blueprint takes no parameters — just hit run.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {bp.parameters.map((p) => (
                    <div key={p.key}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>
                        {p.label}{p.required && <span style={{ color: 'var(--neg)' }}> *</span>}
                      </div>
                      {p.type === 'select' && p.options ? (
                        <select value={paramValues[p.key] ?? ''} onChange={(e) => setParamValues((s) => ({ ...s, [p.key]: e.target.value }))} style={inputStyle}>
                          <option value="">Pick one…</option>
                          {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : p.type === 'longtext' ? (
                        <textarea value={paramValues[p.key] ?? ''} onChange={(e) => setParamValues((s) => ({ ...s, [p.key]: e.target.value }))} style={{ ...inputStyle, minHeight: 60 }} />
                      ) : (
                        <input
                          type={p.type === 'number' ? 'number' : p.type === 'date' ? 'date' : 'text'}
                          value={paramValues[p.key] ?? ''}
                          onChange={(e) => setParamValues((s) => ({ ...s, [p.key]: e.target.value }))}
                          placeholder={p.helpText || (p.type === 'tickers' ? 'NVDA, AMD, AVGO' : p.type === 'ticker' ? 'NVDA' : '')}
                          style={inputStyle}
                        />
                      )}
                      {p.helpText && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{p.helpText}</div>}
                    </div>
                  ))}
                </div>
              )}
              <button onClick={runBp} disabled={running} style={{ ...primaryBtn, width: '100%', marginTop: 14 }}>
                {running ? 'Running… (this can take 30–90s)' : '▶ Run Blueprint'}
              </button>
              {error && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 8, border: '1px solid var(--neg-dim)', color: 'var(--neg)', fontSize: 12 }}>
                  {error.startsWith('missing_parameter:') ? `Required parameter missing: ${error.split(':')[1]}` : error}
                </div>
              )}
            </Card>

            {run && (
              <Card>
                <SectionLabel>Run · {run.status === 'ok' ? '✔ complete' : '✖ failed'}</SectionLabel>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                  {run.stepResults.length} step{run.stepResults.length === 1 ? '' : 's'} · {(run.totalLatencyMs / 1000).toFixed(1)}s
                  {run.pinnedNoteId && <> · pinned to notebook</>}
                </div>
                {run.stepResults.map((s, i) => (
                  <div key={s.stepId} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: i === run.stepResults.length - 1 ? 'none' : '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--accent-text)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                      Step {i + 1} · {s.title}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{s.headline}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>{s.summary}</div>
                    {s.findings.length > 0 && (
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)' }}>
                        {s.findings.map((f, j) => (
                          <li key={j} style={{ marginBottom: 4 }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{f.title}</strong> — {f.detail}
                          </li>
                        ))}
                      </ul>
                    )}
                    {s.errorMessage && <div style={{ fontSize: 11, color: 'var(--neg)', marginTop: 6 }}>{s.errorMessage}</div>}
                  </div>
                ))}
                {run.errorMessage && (
                  <div style={{ marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid var(--neg-dim)', color: 'var(--neg)', fontSize: 12 }}>{run.errorMessage}</div>
                )}
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Editor sub-components ──────────────────────────────────────────────────

function ParameterEditor({ params, editing, onChange }: {
  params: BlueprintParameter[]
  editing: boolean
  onChange: (p: BlueprintParameter[]) => void
}) {
  const update = (i: number, patch: Partial<BlueprintParameter>) => {
    const next = params.slice(); next[i] = { ...next[i], ...patch }; onChange(next)
  }
  const add = () => onChange([...params, { key: `p${params.length + 1}`, label: 'New parameter', type: 'text' }])
  const del = (i: number) => onChange(params.filter((_, idx) => idx !== i))

  if (!editing) {
    if (!params.length) return <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No parameters declared.</div>
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {params.map((p) => (
          <div key={p.key} style={rowStyle}>
            <code style={{ fontSize: 11, color: 'var(--accent-text)', fontFamily: 'JetBrains Mono, monospace' }}>{`{{${p.key}}}`}</code>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{p.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.type}{p.required ? ' · required' : ''}</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {params.map((p, i) => (
        <div key={i} style={{ ...rowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, width: '100%' }}>
            <input value={p.key} onChange={(e) => update(i, { key: e.target.value })} placeholder="key" style={inputStyle} />
            <input value={p.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Label" style={inputStyle} />
            <select value={p.type} onChange={(e) => update(i, { type: e.target.value as ParamType })} style={inputStyle}>
              {(['text', 'longtext', 'ticker', 'tickers', 'select', 'number', 'date'] as ParamType[]).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={() => del(i)} style={dangerBtn}>×</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%' }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={!!p.required} onChange={(e) => update(i, { required: e.target.checked })} />
              required
            </label>
            <input value={p.helpText ?? ''} onChange={(e) => update(i, { helpText: e.target.value })} placeholder="Help text (optional)" style={{ ...inputStyle, flex: 1 }} />
          </div>
        </div>
      ))}
      <button onClick={add} style={ghostBtn}>+ Add parameter</button>
    </div>
  )
}

function StepEditor({ steps, editing, onChange }: {
  steps: BlueprintStep[]; editing: boolean; onChange: (s: BlueprintStep[]) => void
}) {
  const update = (i: number, patch: Partial<BlueprintStep>) => {
    const next = steps.slice(); next[i] = { ...next[i], ...patch }; onChange(next)
  }
  const add = () => onChange([...steps, { id: `step-${steps.length + 1}`, title: 'New step', prompt: '' }])
  const del = (i: number) => onChange(steps.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = steps.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {steps.map((s, i) => (
        <div key={s.id + i} style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-text)', minWidth: 40 }}>STEP {i + 1}</span>
            {editing ? (
              <input value={s.title} onChange={(e) => update(i, { title: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
            ) : <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{s.title}</span>}
            {editing && (
              <>
                <button onClick={() => move(i, -1)} style={miniBtn} disabled={i === 0}>↑</button>
                <button onClick={() => move(i, 1)} style={miniBtn} disabled={i === steps.length - 1}>↓</button>
                <button onClick={() => del(i)} style={dangerBtn}>×</button>
              </>
            )}
          </div>
          {editing ? (
            <textarea value={s.prompt} onChange={(e) => update(i, { prompt: e.target.value })} style={{ ...inputStyle, minHeight: 110, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />
          ) : (
            <pre style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{s.prompt}</pre>
          )}
          {editing && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 2 }}>
              <input
                type="checkbox"
                checked={!!s.requiresApproval}
                onChange={(e) => update(i, { requiresApproval: e.target.checked })}
              />
              <span style={{ fontSize: 11.5, color: 'var(--amber)', fontWeight: 600 }}>
                ⏸ Require human approval after this step
              </span>
            </label>
          )}
          {!editing && s.requiresApproval && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: 'rgba(251,191,36,0.14)', color: 'var(--amber)', fontWeight: 700, display: 'inline-block', marginTop: 4 }}>⏸ HITL checkpoint</span>
          )}
        </div>
      ))}
      {editing && <button onClick={add} style={ghostBtn}>+ Add step</button>}
    </div>
  )
}

function OutputsEditor({ outputs, editing, onChange }: {
  outputs: BlueprintExpectedOutput[]; editing: boolean; onChange: (o: BlueprintExpectedOutput[]) => void
}) {
  const update = (i: number, patch: Partial<BlueprintExpectedOutput>) => {
    const next = outputs.slice(); next[i] = { ...next[i], ...patch }; onChange(next)
  }
  const add = () => onChange([...outputs, { key: `out${outputs.length + 1}`, label: 'New output' }])
  const del = (i: number) => onChange(outputs.filter((_, idx) => idx !== i))

  if (!editing) {
    if (!outputs.length) return <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No expected outputs declared.</div>
    return (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {outputs.map((o) => (
          <li key={o.key} style={{ fontSize: 12.5, marginBottom: 4 }}>
            <strong>{o.label}</strong>{o.description && <span style={{ color: 'var(--text-muted)' }}> — {o.description}</span>}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {outputs.map((o, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 8 }}>
          <input value={o.key} onChange={(e) => update(i, { key: e.target.value })} placeholder="key" style={inputStyle} />
          <input value={o.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Label" style={inputStyle} />
          <input value={o.description ?? ''} onChange={(e) => update(i, { description: e.target.value })} placeholder="Description" style={inputStyle} />
          <button onClick={() => del(i)} style={dangerBtn}>×</button>
        </div>
      ))}
      <button onClick={add} style={ghostBtn}>+ Add output</button>
    </div>
  )
}

// ── Tiny presentational helpers ────────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 14 }}>{children}</div>
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>{children}</div>
}
function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}
function Readonly({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{children}</div> }
function ChipList({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((s) => <span key={s} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{s}</span>)}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  background: 'var(--bg-base)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit',
}
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: 10, borderRadius: 10, background: 'var(--bg-base)', border: '1px solid var(--border)',
}
const ghostBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 10, background: 'transparent',
  border: '1px solid var(--border)', color: 'var(--text-primary)',
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const primaryBtn: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 10, background: 'var(--gradient-brand)',
  border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: '0 4px 14px var(--accent-dim)',
}
const dangerBtn: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8, background: 'transparent',
  border: '1px solid var(--neg-dim)', color: 'var(--neg)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const miniBtn: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 6, background: 'transparent',
  border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
}

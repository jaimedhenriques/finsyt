'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '@/lib/api-url'

// Reusable modal used from Matrix (and any other surface) to pick a Blueprint
// from the library and run it against a contextual target — passing
// `target.label` and `target.payload` lets the runner thread the surrounding
// context (matrix template, document list, etc.) into every step prompt.

type ParamType = 'text' | 'longtext' | 'ticker' | 'tickers' | 'select' | 'number' | 'date'

interface BlueprintParameter {
  key: string; label: string; type: ParamType; required?: boolean
  defaultValue?: string | number | string[]; options?: string[]; helpText?: string
}
interface BlueprintListItem {
  id: string; name: string; description: string; category: string; icon: string
  visibility: string; version: number; isPublished: boolean
  parameters: BlueprintParameter[]
  steps: { id: string; title: string }[]
}

interface RunStepResult {
  stepId: string; title: string; headline: string; summary: string
  findings: { title: string; detail: string }[]
  sources: { label: string; meta: string }[]
  ok: boolean; latencyMs: number; errorMessage?: string
}
interface RunResult {
  runId: string; status: 'ok' | 'error'
  stepResults: RunStepResult[]; finalOutput: RunStepResult | null
  pinnedNoteId: string | null; totalLatencyMs: number; errorMessage?: string
}

export interface BlueprintRunTarget {
  kind?: 'matrix' | 'company' | 'peer-set' | 'workspace' | 'none'
  label?: string
  payload?: Record<string, unknown>
}

export function BlueprintRunModal({ open, onClose, target }: {
  open: boolean
  onClose: () => void
  target?: BlueprintRunTarget | null
}) {
  const [items, setItems] = useState<BlueprintListItem[] | null>(null)
  const [picked, setPicked] = useState<BlueprintListItem | null>(null)
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState<RunResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setItems(null); setPicked(null); setRun(null); setError(null); setParamValues({})
    fetch(apiUrl('/api/blueprints'), { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return }
        setItems(data.blueprints || [])
      })
      .catch((e: Error) => setError(e.message))
  }, [open])

  // When the user picks a Blueprint, hydrate the form with its defaults so a
  // single click can launch a run.
  useEffect(() => {
    if (!picked) return
    const initial: Record<string, string> = {}
    for (const p of picked.parameters) {
      if (p.defaultValue !== undefined) {
        initial[p.key] = Array.isArray(p.defaultValue) ? p.defaultValue.join(', ') : String(p.defaultValue)
      }
    }
    setParamValues(initial)
  }, [picked])

  const grouped = useMemo(() => {
    const out: Record<string, BlueprintListItem[]> = {}
    for (const it of items ?? []) {
      ;(out[it.category] ??= []).push(it)
    }
    return out
  }, [items])

  if (!open) return null

  async function runIt() {
    if (!picked) return
    setRunning(true); setRun(null); setError(null)
    try {
      const params: Record<string, string | number | string[]> = {}
      for (const p of picked.parameters) {
        const raw = (paramValues[p.key] ?? '').trim()
        if (!raw) continue
        if (p.type === 'tickers') params[p.key] = raw.split(/[\s,]+/).filter(Boolean)
        else if (p.type === 'number') params[p.key] = Number(raw)
        else params[p.key] = raw
      }
      const r = await fetch(apiUrl('/api/blueprints/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintId: picked.id, parameters: params, target }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data?.error || 'run failed'); return }
      setRun(data.run)
    } catch (e) { setError((e as Error).message) }
    finally { setRunning(false) }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Run a Blueprint" onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 1100, maxHeight: '90vh', overflow: 'auto',
        background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 16,
        display: 'grid', gridTemplateColumns: picked ? '320px 1fr' : '1fr', gap: 0,
      }}>
        {/* Library list */}
        <aside style={{ borderRight: picked ? '1px solid var(--border)' : 'none', padding: 20, overflowY: 'auto', maxHeight: '90vh' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Run a Blueprint</h3>
            <button onClick={onClose} style={iconBtn} aria-label="Close">×</button>
          </div>
          {target?.label && (
            <div style={{ fontSize: 11, color: 'var(--accent-text)', marginBottom: 12, padding: '6px 10px', background: 'var(--accent-dim)', borderRadius: 8 }}>
              Target: {target.label}
            </div>
          )}
          {!items && !error && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading library…</div>}
          {error && <div style={{ fontSize: 12, color: 'var(--neg)' }}>{error}</div>}
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{cat}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {list.map((it) => (
                  <button key={it.id} onClick={() => { setPicked(it); setRun(null); setError(null) }} style={{
                    textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                    background: picked?.id === it.id ? 'var(--accent-dim)' : 'transparent',
                    border: `1px solid ${picked?.id === it.id ? 'var(--accent)' : 'transparent'}`,
                    color: 'var(--text-primary)', fontFamily: 'inherit', cursor: 'pointer',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14 }}>{it.icon}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{it.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{it.steps.length} steps</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <Link href="/app/agents/library" onClick={onClose} style={{ display: 'block', marginTop: 12, fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none' }}>
            Open full Blueprint library →
          </Link>
        </aside>

        {/* Detail / run */}
        {picked && (
          <section style={{ padding: 20, overflowY: 'auto', maxHeight: '90vh' }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{picked.category} · v{picked.version}</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{picked.name}</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, marginBottom: 14 }}>{picked.description}</p>
            </div>

            {picked.parameters.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                {picked.parameters.map((p) => (
                  <div key={p.key} style={{ gridColumn: p.type === 'longtext' ? '1 / -1' : undefined }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>
                      {p.label}{p.required && <span style={{ color: 'var(--neg)' }}> *</span>}
                    </div>
                    {p.type === 'select' && p.options ? (
                      <select value={paramValues[p.key] ?? ''} onChange={(e) => setParamValues((s) => ({ ...s, [p.key]: e.target.value }))} style={inputStyle}>
                        <option value="">Pick one…</option>
                        {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : p.type === 'longtext' ? (
                      <textarea value={paramValues[p.key] ?? ''} onChange={(e) => setParamValues((s) => ({ ...s, [p.key]: e.target.value }))} style={{ ...inputStyle, minHeight: 80 }} />
                    ) : (
                      <input
                        type={p.type === 'number' ? 'number' : p.type === 'date' ? 'date' : 'text'}
                        value={paramValues[p.key] ?? ''}
                        onChange={(e) => setParamValues((s) => ({ ...s, [p.key]: e.target.value }))}
                        placeholder={p.helpText || (p.type === 'tickers' ? 'NVDA, AMD, AVGO' : p.type === 'ticker' ? 'NVDA' : '')}
                        style={inputStyle}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>This Blueprint takes no parameters — just hit run.</div>
            )}

            <button onClick={runIt} disabled={running} style={{ ...primaryBtn, width: '100%' }}>
              {running ? 'Running… (30–90s)' : '▶ Run Blueprint'}
            </button>
            {error && <div style={{ marginTop: 10, padding: 10, borderRadius: 8, border: '1px solid var(--neg-dim)', color: 'var(--neg)', fontSize: 12 }}>{error}</div>}

            {run && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                  {run.status === 'ok' ? '✔ Complete' : '✖ Failed'} · {run.stepResults.length} steps · {(run.totalLatencyMs / 1000).toFixed(1)}s
                  {run.pinnedNoteId && <> · pinned to notebook</>}
                </div>
                {run.stepResults.map((s, i) => (
                  <div key={s.stepId} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: 'var(--accent-text)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Step {i + 1} · {s.title}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{s.headline}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.summary}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8, background: 'transparent',
  border: '1px solid var(--border)', color: 'var(--text-secondary)',
  fontSize: 16, cursor: 'pointer', fontFamily: 'inherit',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit',
}
const primaryBtn: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 10, background: 'var(--gradient-brand)',
  border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: '0 4px 14px var(--accent-dim)',
}

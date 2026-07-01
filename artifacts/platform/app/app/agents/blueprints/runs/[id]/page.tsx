'use client'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '@/lib/api-url'

// Blueprint Run Detail Page — shows a step-by-step timeline of a run,
// with HITL approval/reject controls when the run is paused at a checkpoint.

interface StepResult {
  stepId: string
  title: string
  headline: string
  summary: string
  findings: { title: string; detail: string }[]
  sources: { label: string; meta: string }[]
  model: string | null
  provider: string
  latencyMs: number
  ok: boolean
  errorMessage?: string
}

interface RunDetail {
  id: string
  blueprintId: string
  blueprintName: string
  blueprintCategory: string
  blueprintIcon: string
  triggeredBy: string
  triggeredByUserId: string | null
  runStatus: string
  stepResults: StepResult[]
  finalOutput: StepResult | null
  sources: { label: string; meta: string }[]
  errorMessage: string | null
  latencyMs: number | null
  pinnedNoteId: string | null
  pendingCheckpointIdx: number | null
  startedAt: string
  completedAt: string | null
  parameters: Record<string, unknown>
}

const STATUS_TONE: Record<string, { bg: string; fg: string; dot: boolean }> = {
  ok:                { bg: 'rgba(52,211,153,0.18)',  fg: 'var(--pos)',          dot: false },
  error:             { bg: 'rgba(248,113,113,0.16)',  fg: 'var(--neg)',          dot: false },
  running:           { bg: 'rgba(27,79,255,0.18)',    fg: 'var(--accent-text)',  dot: true  },
  awaiting_approval: { bg: 'rgba(251,191,36,0.18)',   fg: 'var(--amber)',        dot: true  },
  rejected:          { bg: 'rgba(248,113,113,0.16)',  fg: 'var(--neg)',          dot: false },
}

const STATUS_LABEL: Record<string, string> = {
  ok:                '✔ Complete',
  error:             '✖ Failed',
  running:           '⟳ Running',
  awaiting_approval: '⏸ Awaiting Approval',
  rejected:          '✕ Rejected',
}

export default function BlueprintRunDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const runId = params?.id

  const [run, setRun] = useState<RunDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const fetchRun = useCallback(async () => {
    if (!runId) return
    try {
      const r = await fetch(apiUrl(`/api/blueprints/runs/${runId}`), { cache: 'no-store' })
      const data = await r.json()
      if (!r.ok || data.error) { setError(data?.error || `HTTP ${r.status}`); return }
      setRun(data.run)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [runId])

  useEffect(() => { fetchRun() }, [fetchRun])

  // Poll while running.
  useEffect(() => {
    if (!run) return
    if (run.runStatus !== 'running') return
    const t = setInterval(fetchRun, 3000)
    return () => clearInterval(t)
  }, [run?.runStatus, fetchRun])

  const approve = useCallback(async () => {
    if (!run || approving) return
    setApproving(true)
    try {
      const r = await fetch(apiUrl(`/api/blueprints/runs/${run.id}/approve`), { method: 'POST' })
      const data = await r.json()
      if (!r.ok) { setError(data?.error || 'approve failed'); return }
      setRun(data.run)
      // Poll until run finishes.
      fetchRun()
    } finally { setApproving(false) }
  }, [run, approving, fetchRun])

  const reject = useCallback(async () => {
    if (!run || rejecting) return
    if (!confirm('Reject this checkpoint? The run will be aborted.')) return
    setRejecting(true)
    try {
      const r = await fetch(apiUrl(`/api/blueprints/runs/${run.id}/reject`), { method: 'POST' })
      const data = await r.json()
      if (!r.ok) { setError(data?.error || 'reject failed'); return }
      setRun((prev) => prev ? { ...prev, runStatus: 'rejected', completedAt: data.run.completedAt, errorMessage: data.run.errorMessage } : prev)
    } finally { setRejecting(false) }
  }, [run, rejecting])

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
        Loading run…
      </div>
    )
  }
  if (error && !run) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--neg)' }}>Failed to load run</div>
        <div style={{ fontSize: 12, marginBottom: 16 }}>{error}</div>
        <button onClick={() => router.back()} style={ghostBtn}>← Go back</button>
      </div>
    )
  }
  if (!run) return null

  const tone = STATUS_TONE[run.runStatus] || STATUS_TONE['error']
  const statusLabel = STATUS_LABEL[run.runStatus] || run.runStatus
  const startedOn = new Date(run.startedAt)
  const completedOn = run.completedAt ? new Date(run.completedAt) : null
  const elapsed = completedOn
    ? ((completedOn.getTime() - startedOn.getTime()) / 1000).toFixed(1)
    : run.latencyMs ? (run.latencyMs / 1000).toFixed(1) : '…'

  const isAwaiting = run.runStatus === 'awaiting_approval'
  const nextStepIdx = run.pendingCheckpointIdx

  return (
    <div style={{ color: 'var(--text-primary)', maxWidth: 960, margin: '0 auto', padding: '24px 32px 80px' }}>
      {/* Back nav */}
      <Link href={`/app/agents/blueprints/${run.blueprintId}`} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
        color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: 18,
      }}>← {run.blueprintName}</Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
          background: 'rgba(27,79,255,0.18)', color: 'var(--accent-text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
        }}>{run.blueprintIcon}</div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: "'Inter Tight','Inter',sans-serif", fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.15 }}>
              {run.blueprintName}
            </h1>
            <StatusBadge status={run.runStatus} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Run <code style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 4 }}>{run.id.slice(0, 8)}</code>
            {' · '}started {startedOn.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            {' · '}{elapsed}s
            {run.triggeredBy && run.triggeredBy !== 'manual' && (
              <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: 10, background: 'rgba(251,191,36,0.15)', color: 'var(--amber)', fontWeight: 700 }}>
                event: {run.triggeredBy.replace('event:', '')}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Link href={`/app/agents/blueprints/${run.blueprintId}`} style={{ ...ghostBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Re-run Blueprint
          </Link>
        </div>
      </div>

      {/* HITL approval card */}
      {isAwaiting && (
        <div style={{
          marginBottom: 24, padding: '20px 24px',
          borderRadius: 14, background: 'rgba(251,191,36,0.10)',
          border: '1px solid rgba(251,191,36,0.35)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>⏸</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--amber)' }}>Run paused — approval required</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                This run has completed the steps above and is waiting for your approval before continuing to
                step {nextStepIdx != null ? nextStepIdx + 1 : '?'}.
                Review the output below and decide whether to proceed.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={approve}
              disabled={approving || rejecting}
              style={{ ...primaryBtn, opacity: approving ? 0.7 : 1 }}
            >
              {approving ? 'Resuming…' : '✔ Approve & Continue'}
            </button>
            <button
              onClick={reject}
              disabled={approving || rejecting}
              style={{ ...dangerBtn, opacity: rejecting ? 0.7 : 1 }}
            >
              {rejecting ? 'Rejecting…' : '✕ Reject & Abort'}
            </button>
          </div>
          {error && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--neg)' }}>{error}</div>}
        </div>
      )}

      {/* Run timeline */}
      <div style={{ marginBottom: 24 }}>
        <SectionHead>Run Timeline · {run.stepResults.length} step{run.stepResults.length !== 1 ? 's' : ''} completed</SectionHead>
        <div style={{ position: 'relative' }}>
          {/* Vertical connector line */}
          {run.stepResults.length > 1 && (
            <div style={{
              position: 'absolute', left: 19, top: 20, bottom: 20,
              width: 1, background: 'var(--border)', zIndex: 0,
            }} />
          )}
          {run.stepResults.map((step, i) => (
            <div key={step.stepId} style={{ display: 'flex', gap: 16, marginBottom: 16, position: 'relative', zIndex: 1 }}>
              {/* Step number indicator */}
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: step.ok ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.16)',
                color: step.ok ? 'var(--pos)' : 'var(--neg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, border: `1px solid ${step.ok ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
              }}>
                {step.ok ? i + 1 : '✖'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 16,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-text)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      Step {i + 1}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{step.title}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                      {(step.latencyMs / 1000).toFixed(1)}s · {step.provider}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.4 }}>
                    {step.headline}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: step.findings.length ? 12 : 0 }}>
                    {step.summary}
                  </div>
                  {step.findings.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {step.findings.map((f, j) => (
                        <li key={j} style={{ marginBottom: 4 }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{f.title}</strong> — {f.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                  {step.sources.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {step.sources.slice(0, 4).map((s, j) => (
                        <span key={j} style={{
                          fontSize: 10, padding: '2px 7px', borderRadius: 5,
                          background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                          color: 'var(--text-muted)',
                        }}>{s.label}</span>
                      ))}
                    </div>
                  )}
                  {step.errorMessage && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--neg)' }}>{step.errorMessage}</div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Pending checkpoint indicator */}
          {isAwaiting && nextStepIdx != null && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, position: 'relative', zIndex: 1 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: 'rgba(251,191,36,0.15)', color: 'var(--amber)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, border: '1px solid rgba(251,191,36,0.35)',
              }}>⏸</div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
                <div style={{
                  background: 'rgba(251,191,36,0.08)', border: '1px dashed rgba(251,191,36,0.35)',
                  borderRadius: 12, padding: '12px 16px',
                  fontSize: 12, color: 'var(--amber)', fontWeight: 600, width: '100%',
                }}>
                  Step {nextStepIdx + 1} — pending approval
                </div>
              </div>
            </div>
          )}

          {/* Running step indicator */}
          {run.runStatus === 'running' && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, position: 'relative', zIndex: 1 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: 'rgba(27,79,255,0.18)', color: 'var(--accent-text)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
              }}>⟳</div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
                <div style={{
                  background: 'rgba(27,79,255,0.08)', border: '1px dashed rgba(27,79,255,0.35)',
                  borderRadius: 12, padding: '12px 16px',
                  fontSize: 12, color: 'var(--accent-text)', fontWeight: 600, width: '100%',
                }}>
                  Step {run.stepResults.length + 1} — in progress…
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error banner */}
      {run.errorMessage && run.runStatus !== 'awaiting_approval' && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 10,
          background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.3)',
          fontSize: 13, color: 'var(--neg)',
        }}>
          {run.errorMessage}
        </div>
      )}

      {/* Sources */}
      {run.sources && run.sources.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionHead>Sources cited</SectionHead>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {run.sources.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                  background: 'rgba(27,79,255,0.18)', color: 'var(--accent-text)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800,
                }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.meta}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        paddingTop: 18, borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Blueprint: <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{run.blueprintName}</span>
          {' · '}run <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 4 }}>{run.id}</code>
        </span>
        {run.pinnedNoteId && (
          <span style={{ fontSize: 11, color: 'var(--pos)', fontWeight: 600 }}>✔ Pinned to notebook</span>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] || STATUS_TONE['error']
  const label = STATUS_LABEL[status] || status
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999,
      background: tone.bg, color: tone.fg, fontSize: 11, fontWeight: 700,
    }}>
      {tone.dot && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: tone.fg,
          boxShadow: `0 0 6px ${tone.fg}`,
        }} />
      )}
      {label}
    </span>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
      letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14,
    }}>{children}</div>
  )
}

const ghostBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 9,
  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
  color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
const primaryBtn: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 10, background: 'var(--gradient-brand)',
  border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px var(--accent-dim)',
}
const dangerBtn: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 10,
  background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.35)',
  color: 'var(--neg)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}

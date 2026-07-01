'use client'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAgentJobs, type AgentJobDTO } from '@/lib/agent-jobs'
import { deliverableLabel } from '@/lib/agent-jobs/types'
import type { JobStepEntry, JobResult } from '@/lib/agent-jobs/types'
import { apiUrl } from '@/lib/api-url'
import { ACTION_ICONS, ICON_SIZE_MD, ICON_SIZE_SM, ICON_STROKE } from '@/components/ui/icons'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.max(1, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

function StatusBadge({ status }: { status: AgentJobDTO['status'] }) {
  const map: Record<AgentJobDTO['status'], { cls: string; label: string }> = {
    queued: { cls: 'badge-gray', label: 'Queued' },
    running: { cls: 'badge-blue', label: 'Running' },
    done: { cls: 'badge-green', label: 'Done' },
    failed: { cls: 'badge-red', label: 'Failed' },
    cancelled: { cls: 'badge-gray', label: 'Cancelled' },
  }
  const m = map[status]
  return <span className={`badge ${m.cls}`}>{m.label}</span>
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: 'var(--gradient-brand)',
          transition: 'width .4s ease',
        }}
      />
    </div>
  )
}

const STEP_ICON: Record<JobStepEntry['kind'], keyof typeof ACTION_ICONS> = {
  plan: 'sparkles',
  tools: 'bot',
  tool_call: 'bot',
  tool_result: 'check',
  synthesise: 'sparkles',
  deliverable: 'download',
  error: 'warn',
  info: 'bot',
}

function ActivityStream({ steps }: { steps: JobStepEntry[] }) {
  if (!steps.length) {
    return <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Waiting for the agent to start…</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {steps.map((s, i) => {
        const Icon = ACTION_ICONS[STEP_ICON[s.kind] ?? 'bot']
        const color = s.kind === 'error' ? 'var(--danger, #f43f5e)' : s.ok === false ? 'var(--danger, #f43f5e)' : 'var(--text-primary)'
        return (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ marginTop: 1, color }}>
              <Icon size={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color }}>
                {s.label}
                {typeof s.ms === 'number' && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>
                    {(s.ms / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
              {s.summary && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{s.summary}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DeliverablePanel({ result }: { result: JobResult }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {result.headline && (
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{result.headline}</div>
      )}
      {result.summary && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
          {result.summary}
        </div>
      )}
      {!!result.findings?.length && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {result.findings.map((f, i) => (
            <div key={i} style={{ padding: 10, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{f.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{f.detail}</div>
            </div>
          ))}
        </div>
      )}
      {!!result.attachments?.length && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {result.attachments.map((a, i) => {
            const href = a.downloadUrl
              ? apiUrl(a.downloadUrl)
              : a.noteId
                ? `${BASE}/app/research?note=${encodeURIComponent(a.noteId)}`
                : a.href ?? null
            const inner = (
              <>
                <ACTION_ICONS.download size={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
                {a.label}
              </>
            )
            const cls = 'inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-white/5'
            return href ? (
              <Link key={i} href={href} className={cls}>{inner}</Link>
            ) : (
              <span key={i} className={cls} style={{ opacity: 0.7 }}>{inner}</span>
            )
          })}
        </div>
      )}
    </div>
  )
}

function JobDetail({ jobId }: { jobId: string }) {
  const { markRead, iterate, refresh } = useAgentJobs()
  const [job, setJob] = useState<AgentJobDTO | null>(null)
  const [thread, setThread] = useState<AgentJobDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [iterateBrief, setIterateBrief] = useState('')
  const [iterating, setIterating] = useState(false)
  const markedRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(apiUrl(`/api/agent-jobs/${jobId}`), { cache: 'no-store' })
      if (!r.ok) return
      const j = await r.json()
      setJob(j.job)
      setThread(Array.isArray(j.thread) ? j.thread : [])
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    setLoading(true)
    setJob(null)
    markedRef.current = null
    load()
  }, [jobId, load])

  // Adaptive poll while in flight.
  useEffect(() => {
    const active = job?.status === 'queued' || job?.status === 'running'
    const id = setInterval(load, active ? 2000 : 20000)
    return () => clearInterval(id)
  }, [load, job?.status])

  // Mark read once we have a settled job.
  useEffect(() => {
    if (job && !job.read && markedRef.current !== job.id) {
      markedRef.current = job.id
      markRead(job.id)
    }
  }, [job, markRead])

  if (loading && !job) {
    return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading job…</div>
  }
  if (!job) {
    return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Job not found.</div>
  }

  async function submitIterate() {
    if (!iterateBrief.trim() || iterating) return
    setIterating(true)
    const child = await iterate(jobId, iterateBrief.trim())
    setIterating(false)
    if (child) {
      setIterateBrief('')
      refresh()
      const u = new URL(window.location.href)
      u.searchParams.set('job', child.id)
      window.history.replaceState(null, '', u.toString())
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <StatusBadge status={job.status} />
          <span className="badge badge-gray">{deliverableLabel(job.deliverableType)}</span>
          {job.context?.symbol ? <span className="badge badge-blue">{String(job.context.symbol)}</span> : null}
          {thread.length > 1 && <span className="badge badge-gray">v{thread.length}</span>}
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Created {timeAgo(job.createdAt)}</span>
        </div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: 8 }}>{job.title}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{job.brief}</p>
      </div>

      {(job.status === 'queued' || job.status === 'running') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{job.currentStep || 'Working…'}</div>
          <ProgressBar value={job.progress} />
        </div>
      )}

      {job.status === 'failed' && job.error && (
        <div style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(244,63,94,.3)', background: 'rgba(244,63,94,.08)', color: '#fca5a5', fontSize: 13 }}>
          {job.error}
        </div>
      )}

      {job.status === 'done' && job.result && (
        <section className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
            Deliverable
          </div>
          <DeliverablePanel result={job.result} />
        </section>
      )}

      <section className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
          Activity
        </div>
        <ActivityStream steps={job.steps} />
      </section>

      {!!job.sources?.length && (
        <section className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
            Sources
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {job.sources.map((s, i) => (
              <div key={i} style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.label}</span>
                {s.meta ? <span style={{ color: 'var(--text-muted)' }}> — {s.meta}</span> : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {(job.status === 'done' || job.status === 'failed') && (
        <section className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
            Iterate on this thread
          </div>
          <textarea
            value={iterateBrief}
            onChange={(e) => setIterateBrief(e.target.value)}
            rows={3}
            placeholder="Refine the deliverable — e.g. add a bear case, focus on margins, extend to peers…"
            className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              onClick={submitIterate}
              disabled={!iterateBrief.trim() || iterating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {iterating ? (
                <ACTION_ICONS.loader size={ICON_SIZE_MD} strokeWidth={ICON_STROKE} className="animate-spin" />
              ) : (
                <ACTION_ICONS.bot size={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />
              )}
              {iterating ? 'Starting…' : 'Run follow-up'}
            </button>
          </div>
        </section>
      )}

      {thread.length > 1 && (
        <section className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
            Versions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {thread.map((v, i) => (
              <Link
                key={v.id}
                href={`${BASE}/app/jobs?job=${encodeURIComponent(v.id)}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', borderRadius: 8,
                  background: v.id === job.id ? 'var(--bg-elevated)' : 'transparent',
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 600 }}>v{i + 1} · {v.title}</span>
                <StatusBadge status={v.status} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function JobsInbox() {
  const { threads, loading, activeCount, refresh } = useAgentJobs()
  const params = useSearchParams()
  const selected = params.get('job')

  useEffect(() => { refresh() }, [refresh])

  const flatSelectedThread = useMemo(() => {
    if (!selected) return null
    return threads.find((t) => t.latest.id === selected || t.history.some((h) => h.id === selected)) ?? null
  }, [threads, selected])

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Jobs</h1>
          <p style={{ fontSize: 13, marginTop: 2, color: 'var(--text-secondary)' }}>
            Delegated analyst jobs — they run in the background and notify you when ready.
            {activeCount > 0 && <span style={{ marginLeft: 8, color: 'var(--text-primary)', fontWeight: 600 }}>{activeCount} active</span>}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 18, alignItems: 'start' }}>
        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && !threads.length && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading jobs…</div>}
          {!loading && !threads.length && (
            <div className="card" style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>No jobs yet</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                Use “Delegate to agent” on a company, workspace, research, or matrix page to start one.
              </div>
            </div>
          )}
          {threads.map((t) => {
            const j = t.latest
            const isSel = flatSelectedThread?.threadId === t.threadId
            return (
              <Link
                key={t.threadId}
                href={`${BASE}/app/jobs?job=${encodeURIComponent(j.id)}`}
                className="card"
                style={{
                  padding: 14,
                  textDecoration: 'none',
                  border: isSel ? '1.5px solid var(--accent, #6366f1)' : '1px solid var(--border)',
                  display: 'block',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <StatusBadge status={j.status} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(j.updatedAt)}</span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!j.read && <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent, #6366f1)', flexShrink: 0 }} />}
                  {j.title}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span>{deliverableLabel(j.deliverableType)}</span>
                  {t.versions > 1 && <span>· v{t.versions}</span>}
                  {j.context?.symbol ? <span>· {String(j.context.symbol)}</span> : null}
                </div>
                {(j.status === 'queued' || j.status === 'running') && (
                  <div style={{ marginTop: 8 }}><ProgressBar value={j.progress} /></div>
                )}
              </Link>
            )
          })}
        </div>

        {/* Detail */}
        <div>
          {selected ? (
            <JobDetail jobId={selected} />
          ) : (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
              Select a job to view its live activity stream and deliverable.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function JobsPage() {
  return (
    <Suspense fallback={<div className="page-content" style={{ color: 'var(--text-secondary)' }}>Loading…</div>}>
      <JobsInbox />
    </Suspense>
  )
}

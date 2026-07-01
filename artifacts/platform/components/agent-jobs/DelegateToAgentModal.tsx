'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAgentJobs } from '@/lib/agent-jobs'
import type { DeliverableType, JobSurface } from '@/lib/agent-jobs/types'
import { ACTION_ICONS, ICON_SIZE_MD, ICON_STROKE } from '@/components/ui/icons'

// Reusable "Delegate to agent" modal. Surfaces (company / workspace / research
// / matrix) open it with a pre-filled context so the runner can ground on the
// right symbol or document set. On submit it creates a job and kicks off the
// detached background runner, then offers a deep link into the jobs inbox.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

const DELIVERABLES: { value: DeliverableType; label: string; hint: string }[] = [
  { value: 'memo', label: 'Investment memo', hint: 'Banker-style memo (PPTX deck)' },
  { value: 'deck', label: 'Slide deck', hint: 'Slide deck deliverable (PPTX)' },
  { value: 'research_note', label: 'Research note', hint: 'Saved to AI Research notes' },
  { value: 'matrix', label: 'Document matrix', hint: 'Extracted matrix brief' },
  { value: 'model', label: 'Financial model', hint: 'Model-oriented written brief' },
  { value: 'analysis', label: 'Analysis brief', hint: 'General written analysis' },
]

export interface DelegateContext {
  surface?: JobSurface
  symbol?: string
  workspaceId?: string
  matrixId?: string
  label?: string
  defaultDeliverable?: DeliverableType
  defaultBrief?: string
  defaultTitle?: string
}

export function DelegateToAgentModal({
  open,
  onClose,
  context,
}: {
  open: boolean
  onClose: () => void
  context?: DelegateContext | null
}) {
  const { delegate } = useAgentJobs()
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [deliverableType, setDeliverableType] = useState<DeliverableType>('analysis')
  const [submitting, setSubmitting] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const symbol = (context?.symbol ?? '').toUpperCase()

  useEffect(() => {
    if (!open) return
    setError(null)
    setCreatedId(null)
    setSubmitting(false)
    setDeliverableType(context?.defaultDeliverable ?? (symbol ? 'memo' : 'analysis'))
    setTitle(
      context?.defaultTitle ??
        (symbol ? `${symbol} — delegated analysis` : context?.label ? `${context.label} — delegated analysis` : 'Delegated analysis'),
    )
    setBrief(
      context?.defaultBrief ??
        (symbol
          ? `Produce a thorough analyst deliverable on ${symbol}. Cover the investment thesis, recent results, valuation, and key risks. Cite every figure.`
          : ''),
    )
  }, [open, context, symbol])

  const canSubmit = useMemo(
    () => title.trim().length > 0 && brief.trim().length > 0 && !submitting,
    [title, brief, submitting],
  )

  if (!open) return null

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    const job = await delegate({
      title: title.trim(),
      brief: brief.trim(),
      deliverableType,
      surface: context?.surface ?? 'other',
      context: {
        ...(symbol ? { symbol } : {}),
        ...(context?.workspaceId ? { workspaceId: context.workspaceId } : {}),
        ...(context?.matrixId ? { matrixId: context.matrixId } : {}),
        ...(context?.label ? { label: context.label } : {}),
      },
    })
    setSubmitting(false)
    if (!job) {
      setError('Could not start the job. Check that you have an active workspace and try again.')
      return
    }
    setCreatedId(job.id)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Delegate to agent"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1330] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.08em] text-indigo-300">Finsyt Agent</div>
            <h2 className="mt-1 text-lg font-semibold text-white">Delegate to agent</h2>
            <p className="mt-1 text-xs text-slate-400">
              Kick off a long-running analyst job. It runs in the background and notifies you when it&apos;s done — you
              can close this and come back.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <ACTION_ICONS.close size={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />
          </button>
        </div>

        {createdId ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              Job started. It&apos;s now running in the background.
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                Close
              </button>
              <Link
                href={`${BASE}/app/jobs?job=${encodeURIComponent(createdId)}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                onClick={onClose}
              >
                View in jobs inbox
                <ACTION_ICONS.arrowRight size={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-300">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
                placeholder="e.g. NVDA — Q2 preview"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-300">Deliverable</span>
              <select
                value={deliverableType}
                onChange={(e) => setDeliverableType(e.target.value as DeliverableType)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
              >
                {DELIVERABLES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label} — {d.hint}
                  </option>
                ))}
              </select>
              {(deliverableType === 'memo' || deliverableType === 'deck') && !symbol && (
                <span className="mt-1 block text-[11px] text-amber-300">
                  Tip: include a ticker in the brief so the deck can be generated.
                </span>
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-300">Brief</span>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={6}
                className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
                placeholder="Describe what you want the agent to produce…"
              />
            </label>

            {error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!canSubmit}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <ACTION_ICONS.loader size={ICON_SIZE_MD} strokeWidth={ICON_STROKE} className="animate-spin" />
                ) : (
                  <ACTION_ICONS.bot size={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />
                )}
                {submitting ? 'Starting…' : 'Delegate'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

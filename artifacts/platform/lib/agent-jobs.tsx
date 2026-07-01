'use client'
import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback, useRef } from 'react'
import type { AgentJobDTO, AgentJobThreadDTO, DeliverableType, JobSurface } from './agent-jobs/types'

export type { AgentJobDTO, AgentJobThreadDTO } from './agent-jobs/types'

// Client provider for delegated analyst jobs. Mirrors AgentsProvider, but
// polls faster when any job is still queued/running so the inbox activity
// stream feels live, then falls back to a slow poll once everything settles.

interface DelegateInput {
  title: string
  brief: string
  deliverableType: DeliverableType
  surface?: JobSurface
  context?: Record<string, unknown>
}

interface JobsCtx {
  jobs: AgentJobDTO[]
  threads: AgentJobThreadDTO[]
  loading: boolean
  synced: boolean
  unreadCount: number
  activeCount: number
  refresh: () => Promise<void>
  delegate: (input: DelegateInput) => Promise<AgentJobDTO | null>
  iterate: (jobId: string, brief: string, overrides?: { deliverableType?: DeliverableType; title?: string }) => Promise<AgentJobDTO | null>
  markRead: (jobId: string) => Promise<void>
}

const Ctx = createContext<JobsCtx | null>(null)

async function jsonOrNull(p: Promise<Response>) {
  try { const r = await p; if (!r.ok) return null; return await r.json() } catch { return null }
}

const SLOW = 30_000
const FAST = 2_000

export function AgentJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<AgentJobDTO[]>([])
  const [threads, setThreads] = useState<AgentJobThreadDTO[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [synced, setSynced] = useState(false)
  const [loading, setLoading] = useState(true)
  const inflight = useRef(false)

  const refresh = useCallback(async () => {
    if (inflight.current) return
    inflight.current = true
    try {
      const res = await jsonOrNull(fetch('/api/agent-jobs', { cache: 'no-store' }))
      if (res) {
        setJobs(Array.isArray(res.jobs) ? res.jobs : [])
        setThreads(Array.isArray(res.threads) ? res.threads : [])
        setUnreadCount(Number(res.unreadCount ?? 0))
        setSynced(true)
      }
    } finally {
      inflight.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const activeCount = useMemo(
    () => jobs.filter((j) => j.status === 'queued' || j.status === 'running').length,
    [jobs],
  )

  // Adaptive poll: fast while a job is in flight, slow once everything settles.
  useEffect(() => {
    const period = activeCount > 0 ? FAST : SLOW
    const id = setInterval(refresh, period)
    return () => clearInterval(id)
  }, [refresh, activeCount])

  const value = useMemo<JobsCtx>(() => ({
    jobs, threads, loading, synced, unreadCount, activeCount, refresh,

    async delegate(input) {
      const res = await fetch('/api/agent-jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) return null
      const json = await res.json()
      const created: AgentJobDTO = json.job
      setJobs((prev) => [created, ...prev])
      refresh()
      return created
    },

    async iterate(jobId, brief, overrides) {
      const res = await fetch(`/api/agent-jobs/${jobId}/iterate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, ...overrides }),
      })
      if (!res.ok) return null
      const json = await res.json()
      const created: AgentJobDTO = json.job
      setJobs((prev) => [created, ...prev])
      refresh()
      return created
    },

    async markRead(jobId) {
      const target = jobs.find((j) => j.id === jobId)
      if (!target || target.read) return
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, read: true } : j)))
      setUnreadCount((prev) => Math.max(0, prev - 1))
      await fetch(`/api/agent-jobs/${jobId}/read`, { method: 'POST' })
    },
  }), [jobs, threads, loading, synced, unreadCount, activeCount, refresh])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAgentJobs(): JobsCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAgentJobs must be used within AgentJobsProvider')
  return ctx
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { createAgentJobSchema } from '@workspace/db'
import { listJobs, insertJob } from '@/lib/agent-jobs/store'
import { startJobRunner } from '@/lib/agent-jobs/runner'
import { resolveUserEmails } from '@/lib/agent-jobs/recipients'
import { rowToDTO, type AgentJobDTO, type AgentJobThreadDTO } from '@/lib/agent-jobs/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── GET /api/agent-jobs ─────────────────────────────────────────────────────
// Returns jobs grouped into threads (latest version per thread) plus a flat
// recent list and the unread count for the bell. Workspace-scoped via the
// agent_jobs RLS policy.
export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ threads: [], jobs: [], unreadCount: 0, reason: 'no_workspace' })

  const rows = await listJobs(orgId, userId)
  const jobs = rows.map(rowToDTO)

  // Group by threadId; newest first within a thread (rows are already
  // createdAt-desc, so the first seen per thread is the latest).
  const byThread = new Map<string, AgentJobDTO[]>()
  for (const j of jobs) {
    const arr = byThread.get(j.threadId) ?? []
    arr.push(j)
    byThread.set(j.threadId, arr)
  }
  const threads: AgentJobThreadDTO[] = [...byThread.values()].map((arr) => ({
    threadId: arr[0].threadId,
    latest: arr[0],
    history: arr.slice(1),
    versions: arr.length,
  }))
  threads.sort((a, b) => (a.latest.createdAt < b.latest.createdAt ? 1 : -1))

  const unreadCount = jobs.filter((j) => !j.read && (j.status === 'done' || j.status === 'failed')).length

  return NextResponse.json({ threads, jobs, unreadCount })
}

// ── POST /api/agent-jobs ────────────────────────────────────────────────────
// Create a job and kick off the detached background runner.
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = createAgentJobSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: parsed.error.flatten() }, { status: 400 })
  }
  const input = parsed.data

  const row = await insertJob({
    orgId,
    userId,
    title: input.title,
    brief: input.brief,
    deliverableType: input.deliverableType,
    surface: input.surface ?? 'other',
    context: input.context ?? {},
  })

  const recipients = await resolveUserEmails(userId)
  startJobRunner({ orgId, userId, jobId: row.id, recipients })

  return NextResponse.json({ job: rowToDTO(row) }, { status: 201 })
}

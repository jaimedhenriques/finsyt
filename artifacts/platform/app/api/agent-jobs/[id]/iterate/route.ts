import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { iterateAgentJobSchema } from '@workspace/db'
import { getJob, insertJob } from '@/lib/agent-jobs/store'
import { startJobRunner } from '@/lib/agent-jobs/runner'
import { resolveUserEmails } from '@/lib/agent-jobs/recipients'
import { rowToDTO } from '@/lib/agent-jobs/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── POST /api/agent-jobs/[id]/iterate ───────────────────────────────────────
// Re-run against a prior job's context: creates a NEW row sharing the parent's
// threadId, with parentJobId pointing at the source job. The new brief is
// prefixed with the parent's prior summary so the runner grounds the follow-up
// on what was already produced.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const { id } = await params
  const parent = await getJob(orgId, userId, id)
  if (!parent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = iterateAgentJobSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: parsed.error.flatten() }, { status: 400 })
  }
  const input = parsed.data

  const priorResult = (parent.result ?? null) as { summary?: string } | null
  const priorContext = priorResult?.summary
    ? `Prior deliverable summary (iterate on this):\n${priorResult.summary}\n\n---\nFollow-up request:\n`
    : ''
  const brief = `${priorContext}${input.brief}`

  const row = await insertJob({
    orgId,
    userId,
    title: input.title ?? parent.title,
    brief,
    deliverableType: input.deliverableType ?? parent.deliverableType,
    surface: parent.surface,
    context: (parent.context ?? {}) as Record<string, unknown>,
    threadId: parent.threadId,
    parentJobId: parent.id,
  })

  const recipients = await resolveUserEmails(userId)
  startJobRunner({ orgId, userId, jobId: row.id, recipients })

  return NextResponse.json({ job: rowToDTO(row) }, { status: 201 })
}

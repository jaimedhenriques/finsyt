import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import {
  withClerkContext,
  audit,
  workflowsTable,
  patchWorkflowSchema,
} from '@workspace/db'
import { validateGraph } from '@/lib/workflows/executor'
import { computeNextRunAt } from '@/lib/workflows/scheduler'
import { serialiseWorkflow } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/workflows/[id] — fetch a single workflow.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const rows = await withClerkContext(orgId, userId, (tx) =>
    tx.select()
      .from(workflowsTable)
      .where(and(eq(workflowsTable.id, id), eq(workflowsTable.orgId, orgId)))
      .limit(1),
  )
  if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ workflow: serialiseWorkflow(rows[0]) })
}

// PATCH /api/workflows/[id] — edit name/description/status/graph/schedule.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = patchWorkflowSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid patch', details: parsed.error.flatten() }, { status: 400 })
  }

  if (parsed.data.graph && parsed.data.graph.nodes.length > 0) {
    const v = validateGraph(parsed.data.graph)
    if (!v.ok) {
      return NextResponse.json({ error: 'invalid graph', details: v.errors }, { status: 400 })
    }
  }

  const result = await withClerkContext(orgId, userId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(workflowsTable)
      .where(and(eq(workflowsTable.id, id), eq(workflowsTable.orgId, orgId)))
      .limit(1)
    if (!existing) return null

    const nextStatus = parsed.data.status ?? existing.status
    // schedule: undefined = leave as-is; null = clear; object = replace.
    const nextSchedule =
      parsed.data.schedule === undefined ? existing.schedule : parsed.data.schedule
    // Recompute the cron anchor whenever status/schedule could change eligibility.
    const scheduleObj = nextSchedule as { frequency?: string } | null
    const nextRunAt =
      nextStatus === 'Active' && scheduleObj && scheduleObj.frequency
        ? computeNextRunAt(nextSchedule as Parameters<typeof computeNextRunAt>[0])
        : null

    const [updated] = await tx
      .update(workflowsTable)
      .set({
        name: parsed.data.name ?? existing.name,
        description: parsed.data.description ?? existing.description,
        status: nextStatus,
        graph: (parsed.data.graph ?? (existing.graph as unknown as object)) as object,
        schedule: (nextSchedule ?? null) as unknown as object,
        nextRunAt,
        updatedAt: new Date(),
      })
      .where(and(eq(workflowsTable.id, id), eq(workflowsTable.orgId, orgId)))
      .returning()
    return updated
  })

  if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 })

  audit.log({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'workflow.updated',
    resourceType: 'workflow',
    resourceId: result.id,
    metadata: { name: result.name, status: result.status, fields: Object.keys(parsed.data) },
  }).catch(() => {})

  return NextResponse.json({ workflow: serialiseWorkflow(result) })
}

// DELETE /api/workflows/[id] — hard-delete a workspace workflow (runs cascade).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const deleted = await withClerkContext(orgId, userId, async (tx) => {
    const rows = await tx
      .delete(workflowsTable)
      .where(and(eq(workflowsTable.id, id), eq(workflowsTable.orgId, orgId)))
      .returning({ id: workflowsTable.id, name: workflowsTable.name })
    return rows[0]
  })
  if (!deleted) return NextResponse.json({ error: 'not found' }, { status: 404 })

  audit.log({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'workflow.deleted',
    resourceType: 'workflow',
    resourceId: deleted.id,
    metadata: { name: deleted.name },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

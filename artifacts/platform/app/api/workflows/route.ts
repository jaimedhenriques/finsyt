import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { desc, eq } from 'drizzle-orm'
import {
  withClerkContext,
  audit,
  workflowsTable,
  insertWorkflowSchema,
  type WorkflowRow,
} from '@workspace/db'
import { validateGraph } from '@/lib/workflows/executor'
import { computeNextRunAt } from '@/lib/workflows/scheduler'
import { requireFeature } from '@/lib/billing-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/workflows — list workflows in the active workspace.
export async function GET(_req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ workflows: [], synced: false, reason: 'no_workspace' })

  const rows = await withClerkContext(orgId, userId, (tx) =>
    tx.select()
      .from(workflowsTable)
      .where(eq(workflowsTable.orgId, orgId))
      .orderBy(desc(workflowsTable.updatedAt))
      .limit(500),
  )

  return NextResponse.json({
    synced: true,
    currentUserId: userId,
    currentOrgId: orgId,
    workflows: rows.map(serialiseWorkflow),
  })
}

// POST /api/workflows — create a workspace-scoped workflow.
export async function POST(req: NextRequest) {
  // Workflow automation is a paid capability — gate creation server-side.
  const gate = await requireFeature('workflow_automation')
  if (!gate.ok) return gate.response!

  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const parsed = insertWorkflowSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid workflow', details: parsed.error.flatten() }, { status: 400 })
  }

  const graph = parsed.data.graph ?? { nodes: [], edges: [] }
  // Only validate the DAG once it has nodes — empty drafts are allowed.
  if (graph.nodes.length > 0) {
    const v = validateGraph(graph)
    if (!v.ok) {
      return NextResponse.json({ error: 'invalid graph', details: v.errors }, { status: 400 })
    }
  }

  const status = parsed.data.status ?? 'Draft'
  const schedule = parsed.data.schedule ?? null
  const nextRunAt = status === 'Active' && schedule ? computeNextRunAt(schedule) : null

  const [created] = await withClerkContext(orgId, userId, (tx) =>
    tx.insert(workflowsTable)
      .values({
        orgId,
        authorUserId: userId,
        name: parsed.data.name,
        description: parsed.data.description ?? '',
        status,
        graph: graph as unknown as object,
        schedule: (schedule ?? null) as unknown as object,
        nextRunAt,
      })
      .returning(),
  )

  audit.log({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'workflow.created',
    resourceType: 'workflow',
    resourceId: created.id,
    metadata: { name: created.name, status: created.status, nodeCount: graph.nodes.length },
  }).catch(() => {})

  return NextResponse.json({ workflow: serialiseWorkflow(created) }, { status: 201 })
}

export function serialiseWorkflow(r: WorkflowRow) {
  return {
    id: r.id,
    orgId: r.orgId,
    authorUserId: r.authorUserId,
    name: r.name,
    description: r.description,
    status: r.status,
    graph: r.graph,
    schedule: r.schedule,
    lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
    nextRunAt: r.nextRunAt ? r.nextRunAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

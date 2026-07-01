import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import { withClerkContext, blueprintRunsTable } from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/blueprints/runs/[id]/reject
// Aborts a run that is awaiting HITL approval.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const runs = await withClerkContext(orgId, userId, (tx) =>
    tx.select().from(blueprintRunsTable)
      .where(and(eq(blueprintRunsTable.id, id), eq(blueprintRunsTable.orgId, orgId)))
      .limit(1),
  )
  if (!runs.length) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const run = runs[0]

  if (run.runStatus !== 'awaiting_approval') {
    return NextResponse.json({ error: `run is not awaiting approval (status: ${run.runStatus})` }, { status: 409 })
  }

  const [updated] = await withClerkContext(orgId, userId, (tx) =>
    tx.update(blueprintRunsTable)
      .set({
        runStatus: 'rejected',
        errorMessage: 'User rejected the approval checkpoint.',
        completedAt: new Date(),
        pendingCheckpointIdx: null,
      })
      .where(and(eq(blueprintRunsTable.id, id), eq(blueprintRunsTable.orgId, orgId)))
      .returning(),
  )

  return NextResponse.json({
    run: {
      id: updated.id,
      runStatus: updated.runStatus,
      errorMessage: updated.errorMessage,
      completedAt: updated.completedAt?.toISOString() ?? null,
    },
  })
}

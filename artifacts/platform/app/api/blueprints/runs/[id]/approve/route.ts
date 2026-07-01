import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq, or } from 'drizzle-orm'
import { withClerkContext, blueprintRunsTable, blueprintsTable, FINSYT_PUBLISHED_ORG_ID } from '@workspace/db'
import { resumeBlueprint } from '@/lib/blueprint-runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/blueprints/runs/[id]/approve
// Resumes a run that is awaiting HITL approval from a checkpoint.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  // Load run.
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
  if (run.pendingCheckpointIdx == null) {
    return NextResponse.json({ error: 'no checkpoint index on run' }, { status: 409 })
  }

  // Resolve the blueprint (needed to get the steps list).
  const bps = await withClerkContext(orgId, userId, (tx) =>
    tx.select().from(blueprintsTable)
      .where(
        and(
          eq(blueprintsTable.id, run.blueprintId),
          or(eq(blueprintsTable.orgId, orgId), eq(blueprintsTable.orgId, FINSYT_PUBLISHED_ORG_ID)),
        ),
      )
      .limit(1),
  )
  if (!bps.length) return NextResponse.json({ error: 'blueprint not found' }, { status: 404 })

  try {
    const result = await resumeBlueprint({
      orgId,
      userId,
      blueprint: bps[0],
      run,
      resumeFromIdx: run.pendingCheckpointIdx,
    })
    return NextResponse.json({ run: result })
  } catch (err) {
    const msg = (err as Error).message || 'resume_failed'
    return NextResponse.json({ error: 'resume failed', detail: msg }, { status: 500 })
  }
}

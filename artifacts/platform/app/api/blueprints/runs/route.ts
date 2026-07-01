import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, desc, eq } from 'drizzle-orm'
import { withClerkContext, blueprintRunsTable, type BlueprintRunRow } from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/blueprints/runs — list recent runs (optionally filtered by blueprint).
export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ runs: [], synced: false, reason: 'no_workspace' })

  const blueprintId = req.nextUrl.searchParams.get('blueprintId') || undefined
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || 50), 200)

  const rows = await withClerkContext(orgId, userId, (tx) =>
    tx.select()
      .from(blueprintRunsTable)
      .where(
        and(
          eq(blueprintRunsTable.orgId, orgId),
          blueprintId ? eq(blueprintRunsTable.blueprintId, blueprintId) : undefined,
        ),
      )
      .orderBy(desc(blueprintRunsTable.startedAt))
      .limit(limit),
  )

  return NextResponse.json({ synced: true, runs: rows.map(serialiseRun) })
}

export function serialiseRun(r: BlueprintRunRow) {
  return {
    id: r.id,
    blueprintId: r.blueprintId,
    blueprintVersion: r.blueprintVersion,
    blueprintName: r.blueprintName,
    blueprintCategory: r.blueprintCategory,
    blueprintIcon: r.blueprintIcon,
    triggeredBy: r.triggeredBy,
    triggeredByUserId: r.triggeredByUserId,
    triggeredByTriggerId: r.triggeredByTriggerId ?? null,
    parameters: r.parameters,
    target: r.target,
    runStatus: r.runStatus,
    stepResults: r.stepResults,
    finalOutput: r.finalOutput,
    sources: r.sources,
    errorMessage: r.errorMessage,
    latencyMs: r.latencyMs,
    pinnedNoteId: r.pinnedNoteId,
    pendingCheckpointIdx: r.pendingCheckpointIdx ?? null,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }
}

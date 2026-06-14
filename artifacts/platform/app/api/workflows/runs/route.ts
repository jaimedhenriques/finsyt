import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, desc, eq } from 'drizzle-orm'
import { withClerkContext, workflowRunsTable, type WorkflowRunRow } from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/workflows/runs — recent runs for the workspace, optionally scoped to
// a single workflow via ?workflowId=<uuid>.
export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ runs: [], synced: false, reason: 'no_workspace' })

  const workflowId = req.nextUrl.searchParams.get('workflowId') || undefined
  if (workflowId && !UUID_RE.test(workflowId)) {
    return NextResponse.json({ error: 'invalid workflowId' }, { status: 400 })
  }

  const rows = await withClerkContext(orgId, userId, (tx) =>
    tx.select()
      .from(workflowRunsTable)
      .where(
        workflowId
          ? and(eq(workflowRunsTable.orgId, orgId), eq(workflowRunsTable.workflowId, workflowId))
          : eq(workflowRunsTable.orgId, orgId),
      )
      .orderBy(desc(workflowRunsTable.startedAt))
      .limit(50),
  )

  return NextResponse.json({ synced: true, runs: rows.map(serialiseRun) })
}

function serialiseRun(r: WorkflowRunRow) {
  return {
    id: r.id,
    workflowId: r.workflowId,
    workflowName: r.workflowName,
    triggeredBy: r.triggeredBy,
    triggeredByUserId: r.triggeredByUserId,
    runStatus: r.runStatus,
    nodeResults: r.nodeResults,
    errorMessage: r.errorMessage,
    latencyMs: r.latencyMs,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, desc, eq, sql } from 'drizzle-orm'
import { withClerkContext, agentRunsTable } from '@workspace/db'
import { serialiseRun } from '../[id]/run/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/agents/runs — workspace-wide run feed for the Inbox + bell.
//   ?limit=50            (default 50, max 200)
//   ?unreadOnly=1        (filter to unread only)
export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId)        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)         return NextResponse.json({ runs: [], unreadCount: 0, synced: false })

  const url = new URL(req.url)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1), 200)
  const unreadOnly = url.searchParams.get('unreadOnly') === '1'

  const { runs, unreadCount } = await withClerkContext(orgId, userId, async (tx) => {
    const where = unreadOnly
      ? and(eq(agentRunsTable.orgId, orgId), eq(agentRunsTable.read, false))
      : eq(agentRunsTable.orgId, orgId)

    const rows = await tx.select().from(agentRunsTable)
      .where(where)
      .orderBy(desc(agentRunsTable.ranAt))
      .limit(limit)

    const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(agentRunsTable)
      .where(and(eq(agentRunsTable.orgId, orgId), eq(agentRunsTable.read, false)))
    return { runs: rows, unreadCount: count?.n ?? 0 }
  })

  return NextResponse.json({
    synced: true,
    unreadCount,
    runs: runs.map(serialiseRun),
  })
}

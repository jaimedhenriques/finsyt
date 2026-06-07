import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import { withClerkContext, agentRunsTable } from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/agents/runs/mark-all-read — clears the unread badge for the bell.
export async function POST() {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const updated = await withClerkContext(orgId, userId, (tx) =>
    tx.update(agentRunsTable).set({ read: true })
      .where(and(eq(agentRunsTable.orgId, orgId), eq(agentRunsTable.read, false)))
      .returning({ id: agentRunsTable.id }),
  )
  return NextResponse.json({ ok: true, marked: updated.length })
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { getJob, getThread } from '@/lib/agent-jobs/store'
import { rowToDTO } from '@/lib/agent-jobs/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── GET /api/agent-jobs/[id] ────────────────────────────────────────────────
// Detail + activity stream for polling. Also returns the full thread chain so
// the detail view can show iterate history.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const { id } = await params
  const row = await getJob(orgId, userId, id)
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const thread = await getThread(orgId, userId, row.threadId)
  return NextResponse.json({
    job: rowToDTO(row),
    thread: thread.map(rowToDTO),
  })
}

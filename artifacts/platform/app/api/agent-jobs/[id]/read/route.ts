import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { getJob, markRead } from '@/lib/agent-jobs/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── POST /api/agent-jobs/[id]/read ──────────────────────────────────────────
// Clears the unread flag once the analyst has opened the finished job.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const { id } = await params
  const row = await getJob(orgId, userId, id)
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await markRead(orgId, userId, id)
  return NextResponse.json({ ok: true })
}

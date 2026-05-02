import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import { withClerkContext, agentRunsTable } from '@workspace/db'
import { serialiseRun } from '../../[id]/run/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET — fetch a single run for the run-output page. Marks the run read.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ runId: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { runId } = await ctx.params
  if (!UUID_RE.test(runId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const run = await withClerkContext(orgId, userId, async (tx) => {
    const [r] = await tx.select().from(agentRunsTable)
      .where(and(eq(agentRunsTable.orgId, orgId), eq(agentRunsTable.id, runId))).limit(1)
    if (!r) return null
    if (!r.read) {
      await tx.update(agentRunsTable).set({ read: true })
        .where(and(eq(agentRunsTable.orgId, orgId), eq(agentRunsTable.id, runId)))
      r.read = true
    }
    return r
  })

  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ run: serialiseRun(run) })
}

// PATCH — body { read: true|false } toggles the read flag from the inbox.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ runId: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { runId } = await ctx.params
  if (!UUID_RE.test(runId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const read = !!body?.read

  const updated = await withClerkContext(orgId, userId, (tx) =>
    tx.update(agentRunsTable).set({ read })
      .where(and(eq(agentRunsTable.orgId, orgId), eq(agentRunsTable.id, runId)))
      .returning({ id: agentRunsTable.id }),
  )
  if (!updated.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true, id: runId, read })
}

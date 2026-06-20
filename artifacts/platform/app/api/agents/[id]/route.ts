import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import {
  withClerkContext,
  agentsTable,
  patchAgentSchema,
} from '@workspace/db'
import { computeNextRunAt } from '@/lib/agent-schedule'
import { serialiseAgent } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const rows = await withClerkContext(orgId, userId, (tx) =>
    tx.select().from(agentsTable).where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.id, id))).limit(1),
  )
  if (!rows.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ agent: serialiseAgent(rows[0]) })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = patchAgentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid patch', details: parsed.error.flatten() }, { status: 400 })

  const update: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() }

  // If schedule or status changes, recompute nextRunAt so the cron picks the
  // new cadence on the next tick. Paused agents have no scheduled fire.
  const updated = await withClerkContext(orgId, userId, async (tx) => {
    const [existing] = await tx.select().from(agentsTable)
      .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.id, id))).limit(1)
    if (!existing) return null

    const finalSchedule = parsed.data.schedule ?? (existing.schedule as any)
    const finalStatus   = parsed.data.status   ?? existing.status
    if (parsed.data.schedule || parsed.data.status) {
      update.nextRunAt = finalStatus === 'Paused' ? null : computeNextRunAt(finalSchedule)
    }

    const [row] = await tx.update(agentsTable).set(update)
      .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.id, id)))
      .returning()
    return row
  })

  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ agent: serialiseAgent(updated) })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const deleted = await withClerkContext(orgId, userId, (tx) =>
    tx.delete(agentsTable)
      .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.id, id)))
      .returning({ id: agentsTable.id }),
  )
  if (!deleted.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true, id })
}

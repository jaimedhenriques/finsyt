import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import {
  withClerkContext,
  agentsTable,
  agentEventTriggersTable,
  insertAgentEventTriggerSchema,
} from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/agents/[id]/triggers — list event triggers for an agent.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const [agent, triggers] = await Promise.all([
    withClerkContext(orgId, userId, (tx) =>
      tx.select({ id: agentsTable.id })
        .from(agentsTable)
        .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.id, id)))
        .limit(1),
    ),
    withClerkContext(orgId, userId, (tx) =>
      tx.select()
        .from(agentEventTriggersTable)
        .where(and(eq(agentEventTriggersTable.orgId, orgId), eq(agentEventTriggersTable.agentId, id))),
    ),
  ])

  if (!agent.length) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ triggers: triggers.map(serialiseTrigger) })
}

// POST /api/agents/[id]/triggers — create a new event trigger.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const parsed = insertAgentEventTriggerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  // Verify agent ownership.
  const agents = await withClerkContext(orgId, userId, (tx) =>
    tx.select({ id: agentsTable.id })
      .from(agentsTable)
      .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.id, id)))
      .limit(1),
  )
  if (!agents.length) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Max 10 triggers per agent.
  const existing = await withClerkContext(orgId, userId, (tx) =>
    tx.select({ id: agentEventTriggersTable.id })
      .from(agentEventTriggersTable)
      .where(and(eq(agentEventTriggersTable.orgId, orgId), eq(agentEventTriggersTable.agentId, id))),
  )
  if (existing.length >= 10) {
    return NextResponse.json({ error: 'max 10 triggers per agent' }, { status: 429 })
  }

  const [trigger] = await withClerkContext(orgId, userId, (tx) =>
    tx.insert(agentEventTriggersTable)
      .values({
        orgId,
        agentId: id,
        triggerType: parsed.data.triggerType,
        config: parsed.data.config as object,
        enabled: parsed.data.enabled ?? true,
      })
      .returning(),
  )

  return NextResponse.json({ trigger: serialiseTrigger(trigger) }, { status: 201 })
}

// DELETE /api/agents/[id]/triggers — delete a trigger by triggerId in body.
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const { triggerId } = body as { triggerId?: string }
  if (!triggerId || !UUID_RE.test(triggerId)) {
    return NextResponse.json({ error: 'triggerId required' }, { status: 400 })
  }

  await withClerkContext(orgId, userId, (tx) =>
    tx.delete(agentEventTriggersTable)
      .where(
        and(
          eq(agentEventTriggersTable.id, triggerId),
          eq(agentEventTriggersTable.orgId, orgId),
          eq(agentEventTriggersTable.agentId, id),
        ),
      ),
  )

  return NextResponse.json({ ok: true })
}

// PATCH /api/agents/[id]/triggers — toggle enabled on a trigger.
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const { triggerId, enabled } = body as { triggerId?: string; enabled?: boolean }
  if (!triggerId || !UUID_RE.test(triggerId) || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'triggerId + enabled required' }, { status: 400 })
  }

  const [updated] = await withClerkContext(orgId, userId, (tx) =>
    tx.update(agentEventTriggersTable)
      .set({ enabled, updatedAt: new Date() })
      .where(
        and(
          eq(agentEventTriggersTable.id, triggerId),
          eq(agentEventTriggersTable.orgId, orgId),
          eq(agentEventTriggersTable.agentId, id),
        ),
      )
      .returning(),
  )
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ trigger: serialiseTrigger(updated) })
}

function serialiseTrigger(t: typeof agentEventTriggersTable.$inferSelect) {
  return {
    id: t.id,
    agentId: t.agentId,
    triggerType: t.triggerType,
    config: t.config,
    enabled: t.enabled,
    lastFiredAt: t.lastFiredAt?.toISOString() ?? null,
    lastCheckedAt: t.lastCheckedAt?.toISOString() ?? null,
    lastError: t.lastError,
    fireCount: t.fireCount,
    createdAt: t.createdAt.toISOString(),
  }
}

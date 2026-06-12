import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { desc, eq } from 'drizzle-orm'
import {
  withClerkContext,
  agentsTable,
  insertAgentSchema,
} from '@workspace/db'
import { computeNextRunAt } from '@/lib/agent-schedule'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/agents — list every agent in the workspace.
export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId)         return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)          return NextResponse.json({ agents: [], synced: false, reason: 'no_workspace' })

  const rows = await withClerkContext(orgId, userId, (tx) =>
    tx.select()
      .from(agentsTable)
      .where(eq(agentsTable.orgId, orgId))
      .orderBy(desc(agentsTable.createdAt))
      .limit(500),
  )

  return NextResponse.json({
    synced: true,
    currentUserId: userId,
    agents: rows.map(serialiseAgent),
  })
}

// POST /api/agents — create a new agent.
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const parsed = insertAgentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid agent', details: parsed.error.flatten() }, { status: 400 })
  }

  const status = parsed.data.status ?? 'Scheduled'
  const nextRunAt = status === 'Paused' ? null : computeNextRunAt(parsed.data.schedule)

  const [created] = await withClerkContext(orgId, userId, (tx) =>
    tx.insert(agentsTable)
      .values({
        orgId,
        authorUserId: userId,
        name: parsed.data.name,
        status,
        templateSlug: parsed.data.templateSlug,
        category: parsed.data.category,
        icon: parsed.data.icon ?? '◎',
        schedule: parsed.data.schedule,
        instructions: parsed.data.instructions,
        nextRunAt,
      })
      .returning(),
  )

  return NextResponse.json({ agent: serialiseAgent(created) }, { status: 201 })
}

export function serialiseAgent(r: typeof agentsTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    templateSlug: r.templateSlug ?? undefined,
    category: r.category,
    icon: r.icon,
    schedule: r.schedule as { frequency: string; day?: string; time?: string; timezone?: string },
    instructions: r.instructions,
    createdAt: r.createdAt.toISOString().slice(0, 10),
    lastRunAt: r.lastRunAt?.toISOString(),
    nextRunAt: r.nextRunAt?.toISOString(),
    authorUserId: r.authorUserId,
  }
}

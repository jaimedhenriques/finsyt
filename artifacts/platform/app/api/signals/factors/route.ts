import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { desc, eq } from 'drizzle-orm'
import {
  withClerkContext,
  factorStrategiesTable,
  factorStrategyInputSchema,
  auditLog,
} from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/signals/factors — every saved Factor Lab strategy in the active
// workspace. Workspace-scoped: any teammate can read, only the author can
// mutate (RLS on `factor_strategies`).
export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ strategies: [] })

  const rows = await withClerkContext(orgId, userId, async (tx) =>
    tx
      .select()
      .from(factorStrategiesTable)
      .where(eq(factorStrategiesTable.orgId, orgId))
      .orderBy(desc(factorStrategiesTable.updatedAt))
      .limit(100),
  )

  return NextResponse.json({
    strategies: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      config: r.config,
      authorUserId: r.authorUserId,
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
    })),
  })
}

// POST /api/signals/factors — save a new strategy. The author is the only user
// permitted to mutate it later (RLS).
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) {
    return NextResponse.json({ error: 'Join or create a workspace to save factor strategies' }, { status: 409 })
  }

  let raw: unknown
  try { raw = await req.json() } catch { raw = {} }
  const parsed = factorStrategyInputSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
  }

  const created = await withClerkContext(orgId, userId, async (tx) => {
    const [row] = await tx
      .insert(factorStrategiesTable)
      .values({
        orgId,
        authorUserId: userId,
        name: parsed.data.name,
        description: parsed.data.description ?? '',
        config: parsed.data.config,
      })
      .returning()
    return row
  })

  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'signals.factor.created',
    resourceType: 'factor_strategy',
    resourceId: created.id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    metadata: { name: created.name, factor: parsed.data.config.factor },
  }).catch(() => { /* audit failure must never break the API */ })

  return NextResponse.json({
    strategy: {
      id: created.id,
      name: created.name,
      description: created.description,
      config: created.config,
      authorUserId: created.authorUserId,
      createdAt: created.createdAt.getTime(),
      updatedAt: created.updatedAt.getTime(),
    },
  })
}

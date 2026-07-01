import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import {
  withClerkContext,
  factorStrategiesTable,
  factorStrategyPatchSchema,
  auditLog,
} from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PATCH /api/signals/factors/[id] — rename / re-describe / re-parameterise a
// saved strategy. RLS restricts the UPDATE to the author within their org.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let raw: unknown
  try { raw = await req.json() } catch { raw = {} }
  const parsed = factorStrategyPatchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
  }

  const updated = await withClerkContext(orgId, userId, async (tx) => {
    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.name !== undefined) patch.name = parsed.data.name
    if (parsed.data.description !== undefined) patch.description = parsed.data.description
    if (parsed.data.config !== undefined) patch.config = parsed.data.config
    const [row] = await tx
      .update(factorStrategiesTable)
      .set(patch)
      .where(and(eq(factorStrategiesTable.id, id), eq(factorStrategiesTable.orgId, orgId)))
      .returning()
    return row
  })

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'signals.factor.updated',
    resourceType: 'factor_strategy',
    resourceId: id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    metadata: { name: updated.name },
  }).catch(() => {})

  return NextResponse.json({
    strategy: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      config: updated.config,
      authorUserId: updated.authorUserId,
      createdAt: updated.createdAt.getTime(),
      updatedAt: updated.updatedAt.getTime(),
    },
  })
}

// DELETE /api/signals/factors/[id] — remove a saved strategy. RLS restricts the
// DELETE to the author within their org.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const deleted = await withClerkContext(orgId, userId, async (tx) => {
    const [row] = await tx
      .delete(factorStrategiesTable)
      .where(and(eq(factorStrategiesTable.id, id), eq(factorStrategiesTable.orgId, orgId)))
      .returning()
    return row
  })

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'signals.factor.deleted',
    resourceType: 'factor_strategy',
    resourceId: id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    metadata: { name: deleted.name },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

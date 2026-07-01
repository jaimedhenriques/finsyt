import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq, or } from 'drizzle-orm'
import {
  withClerkContext,
  audit,
  blueprintsTable,
  blueprintVersionsTable,
  patchBlueprintSchema,
  FINSYT_PUBLISHED_ORG_ID,
} from '@workspace/db'
import { serialiseBlueprint } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/blueprints/[id] — fetch a single blueprint (workspace or curated).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  try {
    const rows = await withClerkContext(orgId, userId, (tx) =>
      tx.select()
        .from(blueprintsTable)
        .where(
          and(
            eq(blueprintsTable.id, id),
            or(
              eq(blueprintsTable.orgId, orgId),
              eq(blueprintsTable.orgId, FINSYT_PUBLISHED_ORG_ID),
            ),
          ),
        )
        .limit(1),
    )
    if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ blueprint: serialiseBlueprint(rows[0]) })
  } catch (err) {
    const msg = (err as Error).message || 'db_error'
    return NextResponse.json({ error: 'Failed to load blueprint', detail: msg }, { status: 500 })
  }
}

// PATCH /api/blueprints/[id] — edit + bump version + snapshot prior payload.
// Curated published blueprints are read-only from this endpoint.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = patchBlueprintSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid patch', details: parsed.error.flatten() }, { status: 400 })
  }

  // Block accidental promotion to the curated tier from the workspace API.
  if (parsed.data.visibility === 'published') {
    return NextResponse.json({ error: 'visibility "published" is reserved' }, { status: 403 })
  }

  const result = await withClerkContext(orgId, userId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(blueprintsTable)
      .where(and(eq(blueprintsTable.id, id), eq(blueprintsTable.orgId, orgId)))
      .limit(1)
    if (!existing) return null

    // Snapshot the about-to-be-replaced payload so older runs can be replayed.
    await tx.insert(blueprintVersionsTable).values({
      orgId,
      blueprintId: existing.id,
      version: existing.version,
      authorUserId: existing.authorUserId,
      payload: {
        name: existing.name,
        description: existing.description,
        category: existing.category,
        icon: existing.icon,
        visibility: existing.visibility,
        parameters: existing.parameters,
        steps: existing.steps,
        expectedOutputs: existing.expectedOutputs,
        requiredTools: existing.requiredTools,
        requiredConnectors: existing.requiredConnectors,
      },
    })

    const [updated] = await tx
      .update(blueprintsTable)
      .set({
        name: parsed.data.name ?? existing.name,
        description: parsed.data.description ?? existing.description,
        category: parsed.data.category ?? existing.category,
        icon: parsed.data.icon ?? existing.icon,
        visibility: parsed.data.visibility ?? existing.visibility,
        parameters: (parsed.data.parameters ?? (existing.parameters as unknown as object)) as object,
        steps: (parsed.data.steps ?? (existing.steps as unknown as object)) as object,
        expectedOutputs: (parsed.data.expectedOutputs ?? (existing.expectedOutputs as unknown as object)) as object,
        requiredTools: (parsed.data.requiredTools ?? (existing.requiredTools as unknown as object)) as object,
        requiredConnectors: (parsed.data.requiredConnectors ?? (existing.requiredConnectors as unknown as object)) as object,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(blueprintsTable.id, id), eq(blueprintsTable.orgId, orgId)))
      .returning()
    return updated
  })

  if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 })

  audit.log({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'blueprint.updated',
    resourceType: 'blueprint',
    resourceId: result.id,
    metadata: { name: result.name, version: result.version, fields: Object.keys(parsed.data) },
  }).catch(() => {})

  return NextResponse.json({ blueprint: serialiseBlueprint(result) })
}

// DELETE /api/blueprints/[id] — hard-delete a workspace blueprint.
// Curated rows live under FINSYT_PUBLISHED_ORG_ID and are unreachable here
// because the WHERE clause requires `org_id == orgId`.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const deleted = await withClerkContext(orgId, userId, async (tx) => {
    const rows = await tx
      .delete(blueprintsTable)
      .where(and(eq(blueprintsTable.id, id), eq(blueprintsTable.orgId, orgId)))
      .returning({ id: blueprintsTable.id, name: blueprintsTable.name })
    return rows[0]
  })
  if (!deleted) return NextResponse.json({ error: 'not found' }, { status: 404 })

  audit.log({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'blueprint.deleted',
    resourceType: 'blueprint',
    resourceId: deleted.id,
    metadata: { name: deleted.name },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

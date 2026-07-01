import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, asc, eq, sql } from 'drizzle-orm'
import {
  withClerkContext,
  withOrgContext,
  peerSetsTable,
  peerSetMembersTable,
  peerSetPatchSchema,
  workspacesTable,
  auditLog,
  type DealWorkspaceMetadata,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/peers/sets/:id — full detail (set + ordered member symbols).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 409 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const detail = await withClerkContext(orgId, userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(peerSetsTable)
      .where(and(eq(peerSetsTable.id, id), eq(peerSetsTable.orgId, orgId)))
      .limit(1)
    if (!row) return null
    const members = await tx
      .select()
      .from(peerSetMembersTable)
      .where(and(eq(peerSetMembersTable.setId, id), eq(peerSetMembersTable.orgId, orgId)))
      .orderBy(asc(peerSetMembersTable.position))
    return { row, members }
  })

  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({
    set: {
      id: detail.row.id,
      name: detail.row.name,
      description: detail.row.description,
      authorUserId: detail.row.authorUserId,
      symbols: detail.members.map((m) => m.symbol),
      createdAt: detail.row.createdAt.getTime(),
      updatedAt: detail.row.updatedAt.getTime(),
    },
  })
}

// PATCH /api/peers/sets/:id — owner-only rename / description / symbol-list
// replace. When `symbols` is supplied we delete and re-insert members so the
// final ordering is exactly what the caller provided (preserves analyst intent).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 409 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let raw: unknown
  try { raw = await req.json() } catch { raw = {} }
  const parsed = peerSetPatchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
  }

  const result = await withClerkContext(orgId, userId, async (tx) => {
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.name !== undefined)        updates.name = parsed.data.name
    if (parsed.data.description !== undefined) updates.description = parsed.data.description
    const [row] = await tx
      .update(peerSetsTable)
      .set(updates)
      .where(and(
        eq(peerSetsTable.id, id),
        eq(peerSetsTable.orgId, orgId),
        eq(peerSetsTable.authorUserId, userId),
      ))
      .returning()
    if (!row) return null

    if (parsed.data.symbols !== undefined) {
      await tx.delete(peerSetMembersTable).where(and(
        eq(peerSetMembersTable.setId, id),
        eq(peerSetMembersTable.orgId, orgId),
      ))
      const seen = new Set<string>()
      const values = parsed.data.symbols
        .filter((s) => { if (seen.has(s)) return false; seen.add(s); return true })
        .map((symbol, i) => ({ setId: id, orgId, symbol, position: i }))
      if (values.length > 0) {
        await tx.insert(peerSetMembersTable).values(values)
      }
    }

    const members = await tx
      .select()
      .from(peerSetMembersTable)
      .where(and(eq(peerSetMembersTable.setId, id), eq(peerSetMembersTable.orgId, orgId)))
      .orderBy(asc(peerSetMembersTable.position))
    return { row, members }
  })

  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'peers.set.updated',
    resourceType: 'peer_set',
    resourceId: id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    metadata: {
      name: result.row.name,
      changedSymbols: parsed.data.symbols !== undefined,
      symbolCount: result.members.length,
    },
  }).catch(() => {})

  // Fan-out: when the symbol list changed, mark every linked deal workspace's
  // memo / deck / valuation surfaces stale so analysts who edit the peer set
  // from /app/peers (or any other entry point) don't silently desync the deal
  // pipeline.
  if (parsed.data.symbols !== undefined) {
    try {
      const localOrgId = await resolveLocalOrgId(orgId)
      await withOrgContext(localOrgId, async (tx) => {
        const linked = await tx
          .select()
          .from(workspacesTable)
          .where(and(
            eq(workspacesTable.orgId, localOrgId),
            eq(workspacesTable.kind, 'deal'),
            sql`${workspacesTable.metadata}->>'peerSetId' = ${id}`,
          ))
        for (const ws of linked) {
          const meta = (ws.metadata ?? {}) as DealWorkspaceMetadata
          const cur = new Set(meta.staleSurfaces ?? [])
          cur.add('memo'); cur.add('deck'); cur.add('valuation')
          await tx.update(workspacesTable)
            .set({
              metadata: { ...meta, staleSurfaces: Array.from(cur) },
              updatedAt: new Date(),
            })
            .where(eq(workspacesTable.id, ws.id))
          auditLog({
            orgId,
            actorId: userId,
            actorType: 'user',
            action: 'workspace.deal.surfaces.stale',
            resourceType: 'workspace',
            resourceId: ws.id,
            metadata: { reason: 'peer_set.symbols_changed', peerSetId: id },
          }).catch(() => {})
        }
      })
    } catch { /* fan-out is best-effort; never block the PATCH response */ }
  }

  return NextResponse.json({
    set: {
      id: result.row.id,
      name: result.row.name,
      description: result.row.description,
      authorUserId: result.row.authorUserId,
      symbols: result.members.map((m) => m.symbol),
      createdAt: result.row.createdAt.getTime(),
      updatedAt: result.row.updatedAt.getTime(),
    },
  })
}

// PUT /api/peers/sets/:id — alias of PATCH so callers that follow the more
// REST-conventional "PUT = update" verb (and the original task contract) hit
// the same handler. Both still go through peerSetPatchSchema, so partial
// updates work either way.
export const PUT = PATCH

// DELETE /api/peers/sets/:id — owner-only. Cascade removes members (FK on
// peer_set_members.set_id has ON DELETE CASCADE; the explicit transaction
// is kept as defense-in-depth and to scope the delete to org+author).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 409 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const deleted = await withClerkContext(orgId, userId, (tx) =>
    tx.delete(peerSetsTable)
      .where(and(
        eq(peerSetsTable.id, id),
        eq(peerSetsTable.orgId, orgId),
        eq(peerSetsTable.authorUserId, userId),
      ))
      .returning({ id: peerSetsTable.id, name: peerSetsTable.name }),
  )
  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'peers.set.deleted',
    resourceType: 'peer_set',
    resourceId: deleted[0].id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    metadata: { name: deleted[0].name },
  }).catch(() => {})

  return new NextResponse(null, { status: 204 })
}

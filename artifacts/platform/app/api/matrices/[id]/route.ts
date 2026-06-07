import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import {
  withOrgContext,
  matricesTable,
  patchMatrixSchema,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams { params: Promise<{ id: string }> }

function serialise(row: typeof matricesTable.$inferSelect, currentUserId: string) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rowSourceKind: row.rowSourceKind,
    rowSourceMeta: row.rowSourceMeta ?? {},
    rows: Array.isArray(row.rows) ? row.rows : [],
    columns: Array.isArray(row.columns) ? row.columns : [],
    cells: row.cells && typeof row.cells === 'object' ? row.cells : {},
    rerunOnFiling: row.rerunOnFiling,
    pinned: row.pinned,
    tags: Array.isArray(row.tags) ? row.tags : [],
    authorUserId: row.authorUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    mine: row.authorUserId === currentUserId,
  }
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await params
  const localOrgId = await resolveLocalOrgId(orgId)
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx.select().from(matricesTable).where(and(eq(matricesTable.id, id), eq(matricesTable.orgId, localOrgId))).limit(1),
  )
  if (!rows.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ matrix: serialise(rows[0], userId) })
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await params

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = patchMatrixSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() }
  const localOrgId = await resolveLocalOrgId(orgId)
  // Workspace-shared: any teammate can edit (matches `agents`/`peer_sets` model).
  const updated = await withOrgContext(localOrgId, (tx) =>
    tx.update(matricesTable)
      .set(updates)
      .where(and(eq(matricesTable.id, id), eq(matricesTable.orgId, localOrgId)))
      .returning(),
  )
  if (!updated.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ matrix: serialise(updated[0], userId) })
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await params
  const localOrgId = await resolveLocalOrgId(orgId)
  const removed = await withOrgContext(localOrgId, (tx) =>
    tx.delete(matricesTable)
      .where(and(eq(matricesTable.id, id), eq(matricesTable.orgId, localOrgId), eq(matricesTable.authorUserId, userId)))
      .returning({ id: matricesTable.id }),
  )
  if (!removed.length) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })
  return NextResponse.json({ ok: true })
}

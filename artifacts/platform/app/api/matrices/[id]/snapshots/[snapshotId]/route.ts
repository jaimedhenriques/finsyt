import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  withOrgContext,
  matricesTable,
  matrixSnapshotsTable,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams { params: Promise<{ id: string; snapshotId: string }> }

// GET /api/matrices/[id]/snapshots/[snapshotId]
// Returns the full frozen payload (rows / columns / cells) so the matrix
// page can restore the live grid back to a previous freeze.
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const { id, snapshotId } = await params
  const localOrgId = await resolveLocalOrgId(orgId)

  const snap = await withOrgContext(localOrgId, async (tx) => {
    const m = await tx.select({ id: matricesTable.id }).from(matricesTable)
      .where(and(eq(matricesTable.id, id), eq(matricesTable.orgId, localOrgId)))
      .limit(1)
    if (!m.length) return null
    const rows = await tx.select().from(matrixSnapshotsTable)
      .where(and(
        eq(matrixSnapshotsTable.id, snapshotId),
        eq(matrixSnapshotsTable.matrixId, id),
        eq(matrixSnapshotsTable.orgId, localOrgId),
      ))
      .limit(1)
    return rows[0] || null
  })

  if (!snap) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({
    snapshot: {
      id: snap.id,
      label: snap.label,
      authorUserId: snap.authorUserId,
      createdAt: snap.createdAt.toISOString(),
      rows: Array.isArray(snap.rows) ? snap.rows : [],
      columns: Array.isArray(snap.columns) ? snap.columns : [],
      cells: snap.cells && typeof snap.cells === 'object' ? snap.cells : {},
    },
  })
}

const patchSnapshotSchema = z.object({
  label: z.string().trim().min(1).max(200),
})

// PATCH /api/matrices/[id]/snapshots/[snapshotId]
// Rename a snapshot's label so analysts can fix typos or re-categorise an
// older freeze without recreating it.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const { id, snapshotId } = await params

  let raw: unknown = {}
  try { raw = await req.json() } catch { /* allow empty body */ }
  const parsed = patchSnapshotSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  const localOrgId = await resolveLocalOrgId(orgId)

  const updated = await withOrgContext(localOrgId, async (tx) => {
    const m = await tx.select({ id: matricesTable.id }).from(matricesTable)
      .where(and(eq(matricesTable.id, id), eq(matricesTable.orgId, localOrgId)))
      .limit(1)
    if (!m.length) return null
    const rows = await tx.update(matrixSnapshotsTable)
      .set({ label: parsed.data.label })
      .where(and(
        eq(matrixSnapshotsTable.id, snapshotId),
        eq(matrixSnapshotsTable.matrixId, id),
        eq(matrixSnapshotsTable.orgId, localOrgId),
      ))
      .returning()
    return rows[0] || null
  })

  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({
    snapshot: {
      id: updated.id,
      label: updated.label,
      authorUserId: updated.authorUserId,
      createdAt: updated.createdAt.toISOString(),
    },
  })
}

// DELETE /api/matrices/[id]/snapshots/[snapshotId]
// Remove a snapshot so it stops counting toward the 100-row server-side cap
// and disappears from the drawer.
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const { id, snapshotId } = await params
  const localOrgId = await resolveLocalOrgId(orgId)

  const deleted = await withOrgContext(localOrgId, async (tx) => {
    const m = await tx.select({ id: matricesTable.id }).from(matricesTable)
      .where(and(eq(matricesTable.id, id), eq(matricesTable.orgId, localOrgId)))
      .limit(1)
    if (!m.length) return null
    const rows = await tx.delete(matrixSnapshotsTable)
      .where(and(
        eq(matrixSnapshotsTable.id, snapshotId),
        eq(matrixSnapshotsTable.matrixId, id),
        eq(matrixSnapshotsTable.orgId, localOrgId),
      ))
      .returning({ id: matrixSnapshotsTable.id })
    return rows[0] || null
  })

  if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

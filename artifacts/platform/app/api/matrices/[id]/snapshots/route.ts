import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, desc, eq } from 'drizzle-orm'
import {
  withOrgContext,
  matricesTable,
  matrixSnapshotsTable,
  matrixSnapshotSchema,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ snapshots: [] })
  const { id } = await params
  const localOrgId = await resolveLocalOrgId(orgId)
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx.select({
      id: matrixSnapshotsTable.id,
      label: matrixSnapshotsTable.label,
      authorUserId: matrixSnapshotsTable.authorUserId,
      createdAt: matrixSnapshotsTable.createdAt,
    })
      .from(matrixSnapshotsTable)
      .where(and(eq(matrixSnapshotsTable.matrixId, id), eq(matrixSnapshotsTable.orgId, localOrgId)))
      .orderBy(desc(matrixSnapshotsTable.createdAt))
      .limit(100),
  )
  return NextResponse.json({
    snapshots: rows.map(r => ({
      id: r.id,
      label: r.label,
      authorUserId: r.authorUserId,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}

// POST /api/matrices/[id]/snapshots — freeze the current matrix state.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await params

  let raw: unknown = {}
  try { raw = await req.json() } catch { /* allow empty body */ }
  const parsed = matrixSnapshotSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)
  const created = await withOrgContext(localOrgId, async (tx) => {
    const matrix = await tx.select().from(matricesTable)
      .where(and(eq(matricesTable.id, id), eq(matricesTable.orgId, localOrgId)))
      .limit(1)
    if (!matrix.length) return null
    const m = matrix[0]
    const inserted = await tx.insert(matrixSnapshotsTable).values({
      orgId: localOrgId,
      matrixId: m.id,
      authorUserId: userId,
      label: parsed.data.label || `Snapshot ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      rows: m.rows,
      columns: m.columns,
      cells: m.cells,
    }).returning()
    return inserted[0]
  })

  if (!created) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({
    snapshot: {
      id: created.id,
      label: created.label,
      authorUserId: created.authorUserId,
      createdAt: created.createdAt.toISOString(),
    },
  }, { status: 201 })
}

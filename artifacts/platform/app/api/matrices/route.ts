import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { desc, eq } from 'drizzle-orm'
import {
  withOrgContext,
  matricesTable,
  insertMatrixSchema,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/matrices — list every matrix in the active workspace. Visible to
// any teammate (RLS-scoped to org). For listing we omit the heavy `cells`
// JSON to keep the payload small; details come from /api/matrices/[id].
export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ matrices: [], synced: false, reason: 'no_workspace' })

  const localOrgId = await resolveLocalOrgId(orgId)
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx.select({
      id: matricesTable.id,
      name: matricesTable.name,
      description: matricesTable.description,
      rowSourceKind: matricesTable.rowSourceKind,
      rerunOnFiling: matricesTable.rerunOnFiling,
      pinned: matricesTable.pinned,
      tags: matricesTable.tags,
      authorUserId: matricesTable.authorUserId,
      createdAt: matricesTable.createdAt,
      updatedAt: matricesTable.updatedAt,
    })
      .from(matricesTable)
      .where(eq(matricesTable.orgId, localOrgId))
      .orderBy(desc(matricesTable.pinned), desc(matricesTable.updatedAt))
      .limit(200),
  )
  return NextResponse.json({
    synced: true,
    currentUserId: userId,
    matrices: rows.map(r => ({
      ...r,
      tags: Array.isArray(r.tags) ? r.tags : [],
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      mine: r.authorUserId === userId,
    })),
  })
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = insertMatrixSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)
  const inserted = await withOrgContext(localOrgId, (tx) =>
    tx.insert(matricesTable)
      .values({
        orgId: localOrgId,
        authorUserId: userId,
        name: parsed.data.name,
        description: parsed.data.description ?? '',
        rowSourceKind: parsed.data.rowSourceKind ?? 'manual',
        rowSourceMeta: parsed.data.rowSourceMeta ?? {},
        rows: parsed.data.rows ?? [],
        columns: parsed.data.columns ?? [],
        cells: parsed.data.cells ?? {},
        rerunOnFiling: parsed.data.rerunOnFiling ?? false,
        pinned: parsed.data.pinned ?? false,
        tags: parsed.data.tags ?? [],
      })
      .returning(),
  )
  const row = inserted[0]
  return NextResponse.json({
    matrix: {
      ...row,
      tags: Array.isArray(row.tags) ? row.tags : [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      mine: row.authorUserId === userId,
    },
  }, { status: 201 })
}

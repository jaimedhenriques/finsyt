import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, asc, eq } from 'drizzle-orm'
import {
  withClerkContext,
  reportsTable,
  reportBlocksTable,
  reportPatchSchema,
  auditLog,
} from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/reports/[id] — a single report with its ordered blocks. RLS scopes
// the read to the caller's workspace.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 409 })

  const report = await withClerkContext(orgId, userId, async (tx) => {
    const rows = await tx
      .select()
      .from(reportsTable)
      .where(and(eq(reportsTable.id, id), eq(reportsTable.orgId, orgId)))
      .limit(1)
    if (rows.length === 0) return null
    const r = rows[0]
    const blocks = await tx
      .select()
      .from(reportBlocksTable)
      .where(and(eq(reportBlocksTable.orgId, orgId), eq(reportBlocksTable.reportId, id)))
      .orderBy(asc(reportBlocksTable.position))
    return {
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      symbol: r.symbol,
      authorUserId: r.authorUserId,
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
      blocks: blocks.map((b) => ({
        id: b.id,
        kind: b.kind,
        config: b.config ?? {},
        position: b.position,
      })),
    }
  })

  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  return NextResponse.json({ report, viewerUserId: userId })
}

// PATCH /api/reports/[id] — update report metadata and/or replace its block
// list wholesale. Only the author can mutate (RLS enforces it; a no-op update
// returns 404 so callers can tell apart "not yours" from success).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { raw = {} }
  const parsed = reportPatchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
  }

  const updated = await withClerkContext(orgId, userId, async (tx) => {
    const fields: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.title !== undefined) fields.title = parsed.data.title
    if (parsed.data.subtitle !== undefined) fields.subtitle = parsed.data.subtitle
    if (parsed.data.symbol !== undefined) fields.symbol = parsed.data.symbol

    const [row] = await tx
      .update(reportsTable)
      .set(fields)
      .where(and(eq(reportsTable.id, id), eq(reportsTable.orgId, orgId), eq(reportsTable.authorUserId, userId)))
      .returning()
    if (!row) return null

    if (parsed.data.blocks !== undefined) {
      await tx.delete(reportBlocksTable).where(
        and(eq(reportBlocksTable.orgId, orgId), eq(reportBlocksTable.reportId, id)),
      )
      if (parsed.data.blocks.length > 0) {
        await tx.insert(reportBlocksTable).values(
          parsed.data.blocks.map((b, i) => ({
            reportId: id,
            orgId,
            kind: b.kind,
            config: b.config ?? {},
            position: i,
          })),
        )
      }
    }
    return row
  })

  if (!updated) return NextResponse.json({ error: 'Report not found or not editable' }, { status: 404 })

  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'reports.updated',
    resourceType: 'report',
    resourceId: id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    metadata: { blockCount: parsed.data.blocks?.length ?? null },
  }).catch(() => {})

  return NextResponse.json({
    report: {
      id: updated.id,
      title: updated.title,
      subtitle: updated.subtitle,
      symbol: updated.symbol,
      authorUserId: updated.authorUserId,
      createdAt: updated.createdAt.getTime(),
      updatedAt: updated.updatedAt.getTime(),
    },
  })
}

// DELETE /api/reports/[id] — remove a report (blocks cascade). Author-only.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 409 })

  const removed = await withClerkContext(orgId, userId, async (tx) => {
    const [row] = await tx
      .delete(reportsTable)
      .where(and(eq(reportsTable.id, id), eq(reportsTable.orgId, orgId), eq(reportsTable.authorUserId, userId)))
      .returning()
    return row ?? null
  })

  if (!removed) return NextResponse.json({ error: 'Report not found or not editable' }, { status: 404 })

  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'reports.deleted',
    resourceType: 'report',
    resourceId: id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    metadata: { title: removed.title },
  }).catch(() => {})

  return new NextResponse(null, { status: 204 })
}

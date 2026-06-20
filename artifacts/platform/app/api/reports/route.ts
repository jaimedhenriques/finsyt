import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { desc, eq } from 'drizzle-orm'
import {
  withClerkContext,
  reportsTable,
  reportBlocksTable,
  reportInputSchema,
  auditLog,
} from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/reports — every report in the active workspace (newest first),
// with each report's block count inlined. Workspace-scoped: any teammate can
// read, only the author can mutate (enforced by RLS on `reports`).
export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ reports: [], viewerUserId: userId })

  const reports = await withClerkContext(orgId, userId, async (tx) => {
    const baseRows = await tx
      .select()
      .from(reportsTable)
      .where(eq(reportsTable.orgId, orgId))
      .orderBy(desc(reportsTable.updatedAt))
      .limit(100)
    if (baseRows.length === 0) return []
    const blockRows = await tx
      .select({ reportId: reportBlocksTable.reportId })
      .from(reportBlocksTable)
      .where(eq(reportBlocksTable.orgId, orgId))
    const counts = new Map<string, number>()
    for (const b of blockRows) counts.set(b.reportId, (counts.get(b.reportId) ?? 0) + 1)
    return baseRows.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      symbol: r.symbol,
      authorUserId: r.authorUserId,
      blockCount: counts.get(r.id) ?? 0,
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
    }))
  })

  return NextResponse.json({ reports, viewerUserId: userId })
}

// POST /api/reports — create a report (with its ordered blocks) in the active
// workspace. The author is the only user permitted to mutate it later (RLS).
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) {
    return NextResponse.json(
      { error: 'Join or create a workspace to save reports' },
      { status: 409 },
    )
  }

  let raw: unknown
  try { raw = await req.json() } catch { raw = {} }
  const parsed = reportInputSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
  }

  const created = await withClerkContext(orgId, userId, async (tx) => {
    const [row] = await tx
      .insert(reportsTable)
      .values({
        orgId,
        authorUserId: userId,
        title: parsed.data.title,
        subtitle: parsed.data.subtitle ?? '',
        symbol: parsed.data.symbol ?? '',
      })
      .returning()
    const blocks = parsed.data.blocks ?? []
    if (blocks.length > 0) {
      await tx.insert(reportBlocksTable).values(
        blocks.map((b, i) => ({
          reportId: row.id,
          orgId,
          kind: b.kind,
          config: b.config ?? {},
          position: i,
        })),
      )
    }
    return row
  })

  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'reports.created',
    resourceType: 'report',
    resourceId: created.id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    metadata: { title: created.title, blockCount: parsed.data.blocks?.length ?? 0 },
  }).catch(() => { /* audit failure must never break the API */ })

  return NextResponse.json({
    report: {
      id: created.id,
      title: created.title,
      subtitle: created.subtitle,
      symbol: created.symbol,
      authorUserId: created.authorUserId,
      blockCount: parsed.data.blocks?.length ?? 0,
      createdAt: created.createdAt.getTime(),
      updatedAt: created.updatedAt.getTime(),
    },
  }, { status: 201 })
}

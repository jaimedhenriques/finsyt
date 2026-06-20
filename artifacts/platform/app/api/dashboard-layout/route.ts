import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import {
  withOrgContext,
  dashboardLayoutsTable,
  putDashboardLayoutSchema,
  type PlacedWidgetData,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// dashboard_layouts.org_id is a UUID FK to organizations.id, so we resolve the
// Clerk org id → local UUID and run reads/writes inside `withOrgContext` so RLS
// (`app.current_org_id` GUC) restricts rows to the caller's workspace. Rows are
// further scoped to a single analyst via the `user_id` column on every query so
// one teammate's board never overwrites another's. Layouts are personal, not
// shared.

const DEFAULT_PAGE = '/app'

function normalisePage(raw: string | null | undefined): string {
  const p = (raw ?? '').trim()
  if (!p) return DEFAULT_PAGE
  return p.slice(0, 120)
}

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ layout: null, synced: false, reason: 'no_workspace' })

  const page = normalisePage(req.nextUrl.searchParams.get('page'))
  const localOrgId = await resolveLocalOrgId(orgId)
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx.select()
      .from(dashboardLayoutsTable)
      .where(and(
        eq(dashboardLayoutsTable.orgId, localOrgId),
        eq(dashboardLayoutsTable.userId, userId),
        eq(dashboardLayoutsTable.page, page),
      ))
      .limit(1),
  )

  const row = rows[0]
  return NextResponse.json({
    synced: true,
    page,
    layout: row
      ? { page: row.page, widgets: row.widgets ?? [], updatedAt: row.updatedAt.toISOString() }
      : null,
  })
}

export async function PUT(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = putDashboardLayoutSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  const page = normalisePage(parsed.data.page)
  const widgets = parsed.data.widgets as PlacedWidgetData[]
  const localOrgId = await resolveLocalOrgId(orgId)

  const saved = await withOrgContext(localOrgId, (tx) =>
    tx.insert(dashboardLayoutsTable)
      .values({ orgId: localOrgId, userId, page, widgets })
      .onConflictDoUpdate({
        target: [
          dashboardLayoutsTable.orgId,
          dashboardLayoutsTable.userId,
          dashboardLayoutsTable.page,
        ],
        set: { widgets, updatedAt: new Date() },
      })
      .returning(),
  )

  const row = saved[0]
  return NextResponse.json({
    layout: { page: row.page, widgets: row.widgets ?? [], updatedAt: row.updatedAt.toISOString() },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { sql } from 'drizzle-orm'
import { withOrgContext, workspacesTable, workspaceViewsTable } from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/workspaces/views — record that the current user opened a
// workspace. The deal-room sidebar fires this when a diligence room mounts;
// we upsert on (workspace_id, user_id) so each row stays "last opened" and
// the table doesn't grow per click.
//
// RLS: workspace_views.org_id is bound to the caller's org via
// `withOrgContext` — the `WITH CHECK` clause on the tenant policy refuses
// rows whose org_id doesn't match the active GUC, so a forged workspaceId
// from another tenant cannot be registered here.
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const body = (raw ?? {}) as { workspaceId?: unknown }
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) {
    return NextResponse.json({ error: 'workspaceId must be a uuid' }, { status: 400 })
  }

  const localOrgId = await resolveLocalOrgId(orgId)
  try {
    const result = await withOrgContext(localOrgId, async (tx) => {
      // Confirm the workspace exists in the caller's org *under* RLS — a
      // teammate from another tenant whose request somehow reached this
      // path would see zero rows here and we'd 404 cleanly without ever
      // attempting an INSERT.
      const found = await tx
        .select({ id: workspacesTable.id })
        .from(workspacesTable)
        .where(sql`${workspacesTable.id} = ${workspaceId}`)
        .limit(1)
      if (!found.length) return { ok: false as const, status: 404 }

      // Upsert so each open just bumps `opened_at`. The `WITH CHECK` part of
      // the RLS policy still validates `org_id` matches the active GUC.
      await tx
        .insert(workspaceViewsTable)
        .values({ orgId: localOrgId, workspaceId, userId, openedAt: new Date() })
        .onConflictDoUpdate({
          target: [workspaceViewsTable.workspaceId, workspaceViewsTable.userId],
          set: { openedAt: new Date() },
        })
      return { ok: true as const, status: 200 }
    })
    if (!result.ok) return NextResponse.json({ error: 'not_found' }, { status: result.status })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed to record view'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

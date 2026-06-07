import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { auth } from '@/lib/auth-server'
import { withComplianceContext } from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/audit
//
// Non-admin, resource-scoped read of audit_events for the caller's org.
// Required filters narrow the result set to a single resource so this
// endpoint can't be used to scrape the org-wide audit trail (that lives at
// /api/admin/audit and is owner-only). Supported queries:
//
//   ?resourceType=workspace&resourceId=<uuid>          (required pair)
//   &action=<exact>                                    (optional)
//   &actorId=<clerk_user_id>                           (optional)
//   &limit=N                                           (optional, max 200)
//
// The Deal-team workspace UI uses this for the Team / Activity tabs.
const MAX_LIMIT = 200

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const sp = req.nextUrl.searchParams
  const resourceType = sp.get('resourceType')?.trim()
  const resourceId   = sp.get('resourceId')?.trim()
  const action       = sp.get('action')?.trim() || undefined
  const actorId      = sp.get('actorId')?.trim() || undefined
  const limitRaw     = Number(sp.get('limit') ?? '100')
  const limit        = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 100, MAX_LIMIT))

  if (!resourceType || !resourceId) {
    return NextResponse.json(
      { error: 'resourceType and resourceId are required' },
      { status: 400 },
    )
  }
  // Cheap shape guards so we don't hit the DB with garbage. Resource ids are
  // UUIDs across our compliance tables.
  if (!/^[a-z_]{1,40}$/i.test(resourceType)) {
    return NextResponse.json({ error: 'invalid resourceType' }, { status: 400 })
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resourceId)) {
    return NextResponse.json({ error: 'invalid resourceId' }, { status: 400 })
  }
  if (action && !/^[a-z][a-z0-9_.-]{0,80}$/i.test(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }
  if (actorId && actorId.length > 120) {
    return NextResponse.json({ error: 'invalid actorId' }, { status: 400 })
  }

  try {
    // Column aliases produce camelCase keys directly so the frontend can
    // consume the JSON without a transform layer. `createdAt` is an alias
    // for `occurred_at` so the deal page's Team/Activity tabs (which
    // expect `createdAt`) work unchanged.
    const result = await withComplianceContext(orgId, (tx) =>
      tx.execute(sql`
        SELECT id,
               occurred_at  AS "createdAt",
               occurred_at  AS "occurredAt",
               org_id       AS "orgId",
               actor_id     AS "actorId",
               actor_type   AS "actorType",
               action,
               resource_type AS "resourceType",
               resource_id   AS "resourceId",
               ip,
               user_agent    AS "userAgent",
               metadata
          FROM audit_events
         WHERE org_id        = ${orgId}
           AND resource_type = ${resourceType}
           AND resource_id   = ${resourceId}
           ${action  ? sql`AND action   = ${action}`  : sql``}
           ${actorId ? sql`AND actor_id = ${actorId}` : sql``}
         ORDER BY occurred_at DESC
         LIMIT ${limit}
      `),
    )
    return NextResponse.json({ events: result.rows })
  } catch (err) {
    console.error('GET /api/audit failed', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

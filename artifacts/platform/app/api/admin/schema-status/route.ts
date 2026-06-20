import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ClerkClaims = {
  org_role?: string
  'o.rol'?: string
} & Record<string, unknown>

/** Admin gate — mirrors /api/admin/providers/health/route.ts. */
async function requireAdmin() {
  const { userId, sessionClaims } = await auth()
  if (!userId) return { ok: false as const, status: 401, error: 'unauthorized' }
  const allowList = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
  const inAllowList = allowList.includes(userId)
  const claims = (sessionClaims ?? {}) as ClerkClaims
  const orgRole = claims.org_role || claims['o.rol'] || ''
  const isOrgAdmin = ['org:admin', 'admin', 'org:owner', 'owner'].includes(String(orgRole))
  const explicitDevBypass = process.env.ADMIN_HEALTH_DEV_BYPASS === '1'
    && process.env.NODE_ENV !== 'production'
  if (!(inAllowList || isOrgAdmin || explicitDevBypass)) {
    return { ok: false as const, status: 403, error: 'admin only' }
  }
  return { ok: true as const, userId }
}

/**
 * GET /api/admin/schema-status — read-only check of whether the live database
 * schema matches the Drizzle schema. Runs drizzle-kit's diff engine via
 * `computeSchemaDiff` (it only inspects the pending statements, never applies
 * them) so it is safe to call on demand from the admin dashboard.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const { computeSchemaDiff } = await import('@workspace/db/schema-diff')
    const diff = await computeSchemaDiff()
    return NextResponse.json({
      inSync: diff.inSync,
      statementCount: diff.statementCount,
      // Cap the preview so a large drift doesn't bloat the response.
      statements: diff.statements.slice(0, 50),
      hasDataLoss: diff.hasDataLoss,
      warnings: diff.warnings.slice(0, 20),
      generatedAt: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'schema_check_failed', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

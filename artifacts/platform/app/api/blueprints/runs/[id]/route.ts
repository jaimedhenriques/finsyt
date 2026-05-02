import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import { withClerkContext, blueprintRunsTable } from '@workspace/db'
import { serialiseRun } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/blueprints/runs/[id] — fetch a single run with full results.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const rows = await withClerkContext(orgId, userId, (tx) =>
    tx.select()
      .from(blueprintRunsTable)
      .where(and(eq(blueprintRunsTable.id, id), eq(blueprintRunsTable.orgId, orgId)))
      .limit(1),
  )
  if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ run: serialiseRun(rows[0]) })
}

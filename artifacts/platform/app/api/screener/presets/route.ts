import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, desc, eq, or } from 'drizzle-orm'
import { withClerkContext, screenerPresetsTable, screenerPresetInputSchema } from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/screener/presets — presets visible to the current user in the
// active org: their own + any teammate preset flagged `shared`.
export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ presets: [] })

  // Defense-in-depth: explicit tenant filter mirrors the RLS policies on
  // screener_presets so tenant isolation holds even if RLS is bypassed by a
  // privileged connection role. RLS still provides an independent enforcement
  // layer when DB_RUNTIME_ROLE is configured correctly.
  const rows = await withClerkContext(orgId, userId, (tx) =>
    tx.select()
      .from(screenerPresetsTable)
      .where(
        and(
          eq(screenerPresetsTable.orgId, orgId),
          or(
            eq(screenerPresetsTable.authorUserId, userId),
            eq(screenerPresetsTable.shared, true),
          ),
        ),
      )
      .orderBy(desc(screenerPresetsTable.createdAt))
      .limit(100),
  )

  return NextResponse.json({ presets: rows.map(serialize) })
}

// POST /api/screener/presets — create a preset owned by the current user.
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) {
    return NextResponse.json(
      { error: 'Join or create a workspace to sync presets across devices' },
      { status: 409 },
    )
  }

  let raw: unknown
  try { raw = await req.json() } catch { raw = {} }
  const parsed = screenerPresetInputSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
  }

  const [row] = await withClerkContext(orgId, userId, (tx) =>
    tx.insert(screenerPresetsTable)
      .values({
        orgId,
        authorUserId: userId,
        name: parsed.data.name,
        filters: parsed.data.filters,
        shared: parsed.data.shared ?? false,
      })
      .returning(),
  )

  return NextResponse.json({ preset: serialize(row) }, { status: 201 })
}

function serialize(r: typeof screenerPresetsTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    filters: r.filters as Record<string, unknown>,
    shared: r.shared,
    authorUserId: r.authorUserId,
    createdAt: r.createdAt.getTime(),
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import { withClerkContext, screenerPresetsTable, screenerPresetPatchSchema } from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH /api/screener/presets/:id — owner-only update (rename, edit filters,
// flip the `shared` toggle).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 409 })
  const { id } = await ctx.params

  let raw: unknown
  try { raw = await req.json() } catch { raw = {} }
  const parsed = screenerPresetPatchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
  }

  // Defense-in-depth: explicit (org_id, author_user_id, id) filter mirrors the
  // RLS update policy so ownership is enforced at the query level regardless of
  // whether the connection role bypasses RLS.
  const [row] = await withClerkContext(orgId, userId, (tx) =>
    tx.update(screenerPresetsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(
        and(
          eq(screenerPresetsTable.id, id),
          eq(screenerPresetsTable.orgId, orgId),
          eq(screenerPresetsTable.authorUserId, userId),
        ),
      )
      .returning(),
  )

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({
    preset: {
      id: row.id,
      name: row.name,
      filters: row.filters as Record<string, unknown>,
      shared: row.shared,
      authorUserId: row.authorUserId,
      createdAt: row.createdAt.getTime(),
    },
  })
}

// DELETE /api/screener/presets/:id — owner-only (we never let teammates
// remove a shared preset they didn't create).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 409 })
  const { id } = await ctx.params

  // Defense-in-depth: explicit (org_id, author_user_id, id) filter mirrors the
  // RLS delete policy so ownership is enforced at the query level regardless of
  // whether the connection role bypasses RLS.
  const deleted = await withClerkContext(orgId, userId, (tx) =>
    tx.delete(screenerPresetsTable)
      .where(
        and(
          eq(screenerPresetsTable.id, id),
          eq(screenerPresetsTable.orgId, orgId),
          eq(screenerPresetsTable.authorUserId, userId),
        ),
      )
      .returning({ id: screenerPresetsTable.id }),
  )

  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}

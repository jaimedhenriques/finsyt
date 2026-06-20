import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import {
  withClerkContext,
  peerSetsTable,
  peerSetMembersTable,
  auditLog,
} from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SYMBOL_RE = /^[A-Z0-9.\-]{1,15}$/

// DELETE /api/peers/sets/:id/members/:symbol — owner-only remove of a single
// ticker. Returns 204 even if the symbol wasn't in the set (idempotent).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; symbol: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 409 })
  const { id, symbol: rawSymbol } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const symbol = decodeURIComponent(rawSymbol).trim().toUpperCase()
  if (!SYMBOL_RE.test(symbol)) return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 })

  const result = await withClerkContext(orgId, userId, async (tx) => {
    const [setRow] = await tx
      .select()
      .from(peerSetsTable)
      .where(and(
        eq(peerSetsTable.id, id),
        eq(peerSetsTable.orgId, orgId),
        eq(peerSetsTable.authorUserId, userId),
      ))
      .limit(1)
    if (!setRow) return null
    const removed = await tx
      .delete(peerSetMembersTable)
      .where(and(eq(peerSetMembersTable.setId, id), eq(peerSetMembersTable.symbol, symbol)))
      .returning({ id: peerSetMembersTable.id })
    if (removed.length > 0) {
      await tx.update(peerSetsTable)
        .set({ updatedAt: new Date() })
        .where(eq(peerSetsTable.id, id))
    }
    return { setRow, removedCount: removed.length }
  })

  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (result.removedCount > 0) {
    await auditLog({
      orgId,
      actorId: userId,
      actorType: 'user',
      action: 'peers.member.removed',
      resourceType: 'peer_set',
      resourceId: id,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: req.headers.get('user-agent') ?? null,
      metadata: { symbol, name: result.setRow.name },
    }).catch(() => {})
  }

  return new NextResponse(null, { status: 204 })
}

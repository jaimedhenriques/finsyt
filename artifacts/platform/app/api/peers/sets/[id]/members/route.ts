import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, asc, eq, max } from 'drizzle-orm'
import {
  withClerkContext,
  peerSetsTable,
  peerSetMembersTable,
  peerSetMemberInputSchema,
  auditLog,
} from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/peers/sets/:id/members — append a single ticker to the peer set.
// Owner-only (the set is loaded with author check before insert). Idempotent
// at the unique index level: re-adding an existing symbol returns 200 with
// the prior member row instead of 409.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 409 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let raw: unknown
  try { raw = await req.json() } catch { raw = {} }
  const parsed = peerSetMemberInputSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
  }
  const symbol = parsed.data.symbol

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
    if (!setRow) return { kind: 'forbidden' as const }

    const [existing] = await tx
      .select()
      .from(peerSetMembersTable)
      .where(and(eq(peerSetMembersTable.setId, id), eq(peerSetMembersTable.symbol, symbol)))
      .limit(1)
    if (existing) return { kind: 'exists' as const, set: setRow, member: existing }

    const [{ value: maxPos }] = await tx
      .select({ value: max(peerSetMembersTable.position) })
      .from(peerSetMembersTable)
      .where(eq(peerSetMembersTable.setId, id))

    const [member] = await tx
      .insert(peerSetMembersTable)
      .values({ setId: id, orgId, symbol, position: (maxPos ?? -1) + 1 })
      .returning()

    await tx.update(peerSetsTable)
      .set({ updatedAt: new Date() })
      .where(eq(peerSetsTable.id, id))

    const members = await tx
      .select()
      .from(peerSetMembersTable)
      .where(eq(peerSetMembersTable.setId, id))
      .orderBy(asc(peerSetMembersTable.position))

    return { kind: 'created' as const, set: setRow, member, members }
  })

  if (result.kind === 'forbidden') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (result.kind === 'exists') {
    return NextResponse.json({ ok: true, alreadyMember: true, member: { id: result.member.id, symbol: result.member.symbol } })
  }

  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'peers.member.added',
    resourceType: 'peer_set',
    resourceId: id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    metadata: { symbol, name: result.set.name },
  }).catch(() => {})

  return NextResponse.json({
    ok: true,
    member: { id: result.member.id, symbol: result.member.symbol },
    symbols: result.members.map((m) => m.symbol),
  }, { status: 201 })
}

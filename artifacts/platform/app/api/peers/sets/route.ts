import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, desc, eq, inArray } from 'drizzle-orm'
import {
  withClerkContext,
  peerSetsTable,
  peerSetMembersTable,
  peerSetInputSchema,
  auditLog,
} from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/peers/sets — every peer set in the active workspace, with each
// set's member symbols inlined. Workspace-scoped: any teammate can read,
// only the author can mutate (enforced by the RLS policies on `peer_sets`).
export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ sets: [] })

  const sets = await withClerkContext(orgId, userId, async (tx) => {
    const baseRows = await tx
      .select()
      .from(peerSetsTable)
      .where(eq(peerSetsTable.orgId, orgId))
      .orderBy(desc(peerSetsTable.updatedAt))
      .limit(100)
    if (baseRows.length === 0) return []
    const ids = baseRows.map((r) => r.id)
    const memberRows = await tx
      .select()
      .from(peerSetMembersTable)
      .where(and(
        eq(peerSetMembersTable.orgId, orgId),
        inArray(peerSetMembersTable.setId, ids),
      ))
    const bySet = new Map<string, string[]>()
    for (const r of memberRows.sort((a, b) => a.position - b.position)) {
      const arr = bySet.get(r.setId) || []
      arr.push(r.symbol)
      bySet.set(r.setId, arr)
    }
    return baseRows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      authorUserId: r.authorUserId,
      symbols: bySet.get(r.id) || [],
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
    }))
  })

  return NextResponse.json({ sets })
}

// POST /api/peers/sets — create a new peer set in the active workspace.
// The author is the only user permitted to mutate it later (RLS).
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) {
    return NextResponse.json(
      { error: 'Join or create a workspace to save peer sets' },
      { status: 409 },
    )
  }

  let raw: unknown
  try { raw = await req.json() } catch { raw = {} }
  const parsed = peerSetInputSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 })
  }

  const created = await withClerkContext(orgId, userId, async (tx) => {
    const [row] = await tx
      .insert(peerSetsTable)
      .values({
        orgId,
        authorUserId: userId,
        name: parsed.data.name,
        description: parsed.data.description ?? '',
      })
      .returning()
    if (parsed.data.symbols && parsed.data.symbols.length > 0) {
      const seen = new Set<string>()
      const values = parsed.data.symbols
        .filter((s) => { if (seen.has(s)) return false; seen.add(s); return true })
        .map((symbol, i) => ({ setId: row.id, orgId, symbol, position: i }))
      if (values.length > 0) {
        await tx.insert(peerSetMembersTable).values(values)
      }
    }
    return row
  })

  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'peers.set.created',
    resourceType: 'peer_set',
    resourceId: created.id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    metadata: { name: created.name, symbolCount: parsed.data.symbols?.length ?? 0 },
  }).catch(() => { /* audit failure must never break the API */ })

  return NextResponse.json({
    set: {
      id: created.id,
      name: created.name,
      description: created.description,
      authorUserId: created.authorUserId,
      symbols: parsed.data.symbols ?? [],
      createdAt: created.createdAt.getTime(),
      updatedAt: created.updatedAt.getTime(),
    },
  }, { status: 201 })
}

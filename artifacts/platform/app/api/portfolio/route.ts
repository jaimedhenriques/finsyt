import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, desc, eq } from 'drizzle-orm'
import {
  withOrgContext,
  portfolioPositionsTable,
  insertPortfolioPositionSchema,
  patchPortfolioPositionSchema,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// portfolio_positions.org_id is a UUID FK to organizations.id, so we must
// resolve the Clerk org id → local UUID and use `withOrgContext`.

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ positions: [], synced: false, reason: 'no_workspace' })

  const localOrgId = await resolveLocalOrgId(orgId)
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx.select()
      .from(portfolioPositionsTable)
      .where(eq(portfolioPositionsTable.orgId, localOrgId))
      .orderBy(desc(portfolioPositionsTable.createdAt))
      .limit(500),
  )
  return NextResponse.json({
    synced: true,
    currentUserId: userId,
    positions: rows.map(r => ({
      id: r.id,
      symbol: r.symbol,
      shares: r.shares,
      costBasis: r.costBasis,
      openedAt: r.openedAt.toISOString(),
      sector: r.sector,
      note: r.note,
      authorUserId: r.authorUserId,
      mine: r.authorUserId === userId,
    })),
  })
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  // Support bulk import: array of positions for CSV upload, single object otherwise.
  const items = Array.isArray(raw) ? raw : [raw]
  if (!items.length) return NextResponse.json({ error: 'empty payload' }, { status: 400 })
  if (items.length > 200) return NextResponse.json({ error: 'too many rows (max 200)' }, { status: 400 })

  const parsed: { symbol: string; shares: number; costBasis: number; openedAt?: string; sector?: string; note?: string }[] = []
  for (const it of items) {
    if (it === null || typeof it !== 'object') {
      return NextResponse.json({ error: 'invalid row', details: 'each item must be an object' }, { status: 400 })
    }
    const obj = it as Record<string, unknown>
    const sym = obj.symbol
    const r = insertPortfolioPositionSchema.safeParse({
      ...obj,
      symbol: typeof sym === 'string' ? sym.toUpperCase() : sym,
    })
    if (!r.success) return NextResponse.json({ error: 'invalid row', details: r.error.flatten() }, { status: 400 })
    parsed.push(r.data)
  }

  const localOrgId = await resolveLocalOrgId(orgId)
  const inserted = await withOrgContext(localOrgId, (tx) =>
    tx.insert(portfolioPositionsTable)
      .values(parsed.map(p => ({
        orgId: localOrgId,
        authorUserId: userId,
        symbol: p.symbol,
        shares: p.shares,
        costBasis: p.costBasis,
        openedAt: p.openedAt ? new Date(p.openedAt) : new Date(),
        sector: p.sector,
        note: p.note,
      })))
      .returning(),
  )
  return NextResponse.json({
    positions: inserted.map(r => ({
      id: r.id, symbol: r.symbol, shares: r.shares, costBasis: r.costBasis,
      openedAt: r.openedAt.toISOString(), sector: r.sector, note: r.note,
      authorUserId: r.authorUserId, mine: true,
    })),
  }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = patchPortfolioPositionSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() }
  if (typeof parsed.data.openedAt === 'string') updates.openedAt = new Date(parsed.data.openedAt)

  const localOrgId = await resolveLocalOrgId(orgId)
  const updated = await withOrgContext(localOrgId, (tx) =>
    tx.update(portfolioPositionsTable)
      .set(updates)
      .where(and(eq(portfolioPositionsTable.id, id), eq(portfolioPositionsTable.authorUserId, userId)))
      .returning(),
  )
  if (!updated.length) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })
  const r = updated[0]
  return NextResponse.json({
    position: {
      id: r.id, symbol: r.symbol, shares: r.shares, costBasis: r.costBasis,
      openedAt: r.openedAt.toISOString(), sector: r.sector, note: r.note,
    },
  })
}

export async function DELETE(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)
  const removed = await withOrgContext(localOrgId, (tx) =>
    tx.delete(portfolioPositionsTable)
      .where(and(eq(portfolioPositionsTable.id, id), eq(portfolioPositionsTable.authorUserId, userId)))
      .returning({ id: portfolioPositionsTable.id }),
  )
  if (!removed.length) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })
  return NextResponse.json({ ok: true })
}

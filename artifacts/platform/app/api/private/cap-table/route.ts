import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth-server'
import {
  withOrgContext,
  privateCapTableTable,
  insertCapTableEntrySchema,
  patchCapTableEntrySchema,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/private/cap-table?coresignal_id=...
export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const coresignalId = req.nextUrl.searchParams.get('coresignal_id')
  if (!coresignalId) return NextResponse.json({ error: 'coresignal_id required' }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx.select().from(privateCapTableTable)
      .where(and(
        eq(privateCapTableTable.orgId, localOrgId),
        eq(privateCapTableTable.coresignalId, coresignalId),
      ))
      .orderBy(privateCapTableTable.position, privateCapTableTable.createdAt),
  )

  return NextResponse.json({ entries: rows })
}

// POST /api/private/cap-table
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const parsed = insertCapTableEntrySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', details: parsed.error.flatten() }, { status: 422 })
  }

  const localOrgId = await resolveLocalOrgId(orgId)
  const [row] = await withOrgContext(localOrgId, (tx) =>
    tx.insert(privateCapTableTable).values({
      orgId: localOrgId,
      coresignalId: parsed.data.coresignalId,
      companyName: parsed.data.companyName ?? '',
      entryType: parsed.data.entryType ?? 'shareholder',
      name: parsed.data.name,
      shareClass: parsed.data.shareClass ?? null,
      round: parsed.data.round ?? null,
      shares: parsed.data.shares ?? null,
      ownershipPct: parsed.data.ownershipPct ?? null,
      liquidationPref: parsed.data.liquidationPref ?? null,
      boardSeat: parsed.data.boardSeat ?? null,
      position: parsed.data.position ?? 0,
      data: parsed.data.data ?? {},
      notes: parsed.data.notes ?? '',
    }).returning(),
  )

  return NextResponse.json({ entry: row }, { status: 201 })
}

// PATCH /api/private/cap-table?id=...
export async function PATCH(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const parsed = patchCapTableEntrySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', details: parsed.error.flatten() }, { status: 422 })
  }

  const localOrgId = await resolveLocalOrgId(orgId)
  const updates: Partial<typeof privateCapTableTable.$inferInsert> = {
    ...(parsed.data.name !== undefined    ? { name: parsed.data.name } : {}),
    ...(parsed.data.entryType !== undefined ? { entryType: parsed.data.entryType } : {}),
    ...(parsed.data.shareClass !== undefined ? { shareClass: parsed.data.shareClass ?? null } : {}),
    ...(parsed.data.round !== undefined   ? { round: parsed.data.round ?? null } : {}),
    ...(parsed.data.shares !== undefined  ? { shares: parsed.data.shares ?? null } : {}),
    ...(parsed.data.ownershipPct !== undefined ? { ownershipPct: parsed.data.ownershipPct ?? null } : {}),
    ...(parsed.data.liquidationPref !== undefined ? { liquidationPref: parsed.data.liquidationPref ?? null } : {}),
    ...(parsed.data.boardSeat !== undefined ? { boardSeat: parsed.data.boardSeat ?? null } : {}),
    ...(parsed.data.position !== undefined ? { position: parsed.data.position } : {}),
    ...(parsed.data.data !== undefined    ? { data: parsed.data.data } : {}),
    ...(parsed.data.notes !== undefined   ? { notes: parsed.data.notes } : {}),
    updatedAt: new Date(),
  }

  const [row] = await withOrgContext(localOrgId, (tx) =>
    tx.update(privateCapTableTable)
      .set(updates)
      .where(and(
        eq(privateCapTableTable.id, id),
        eq(privateCapTableTable.orgId, localOrgId),
      ))
      .returning(),
  )

  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ entry: row })
}

// DELETE /api/private/cap-table?id=...
export async function DELETE(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)
  await withOrgContext(localOrgId, (tx) =>
    tx.delete(privateCapTableTable)
      .where(and(
        eq(privateCapTableTable.id, id),
        eq(privateCapTableTable.orgId, localOrgId),
      )),
  )

  return NextResponse.json({ ok: true })
}

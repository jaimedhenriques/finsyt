import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import {
  withOrgContext,
  financialTemplatesTable,
  patchFinancialTemplateSchema,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toDto(r: typeof financialTemplatesTable.$inferSelect, currentUserId: string) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    statementType: r.statementType,
    presentation: r.presentation,
    periodLayout: r.periodLayout,
    numPeriods: r.numPeriods,
    lineItems: r.lineItems,
    authorUserId: r.authorUserId,
    mine: r.authorUserId === currentUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const localOrgId = await resolveLocalOrgId(orgId)
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx.select()
      .from(financialTemplatesTable)
      .where(and(eq(financialTemplatesTable.id, id), eq(financialTemplatesTable.orgId, localOrgId)))
      .limit(1),
  )
  if (!rows.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ template: toDto(rows[0], userId) })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = patchFinancialTemplateSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() }
  if (parsed.data.lineItems) updates.lineItems = parsed.data.lineItems

  const localOrgId = await resolveLocalOrgId(orgId)
  const updated = await withOrgContext(localOrgId, (tx) =>
    tx.update(financialTemplatesTable)
      .set(updates)
      .where(and(
        eq(financialTemplatesTable.id, id),
        eq(financialTemplatesTable.authorUserId, userId),
      ))
      .returning(),
  )
  if (!updated.length) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })
  return NextResponse.json({ template: toDto(updated[0], userId) })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const localOrgId = await resolveLocalOrgId(orgId)
  const removed = await withOrgContext(localOrgId, (tx) =>
    tx.delete(financialTemplatesTable)
      .where(and(
        eq(financialTemplatesTable.id, id),
        eq(financialTemplatesTable.authorUserId, userId),
      ))
      .returning({ id: financialTemplatesTable.id }),
  )
  if (!removed.length) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })
  return NextResponse.json({ ok: true })
}

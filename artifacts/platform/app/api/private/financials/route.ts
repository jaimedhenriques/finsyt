import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth-server'
import { withOrgContext, privateFinancialsTable, insertPrivateFinancialSchema } from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/private/financials?coresignal_id=...
// Returns all financial statements for a private company, scoped to the org.
export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const coresignalId = req.nextUrl.searchParams.get('coresignal_id')
  if (!coresignalId) return NextResponse.json({ error: 'coresignal_id required' }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx.select().from(privateFinancialsTable)
      .where(and(
        eq(privateFinancialsTable.orgId, localOrgId),
        eq(privateFinancialsTable.coresignalId, coresignalId),
      ))
      .orderBy(privateFinancialsTable.statement, privateFinancialsTable.period),
  )

  // Group by statement type
  const grouped: Record<string, any[]> = { income: [], balance: [], cashflow: [] }
  for (const r of rows) {
    const key = r.statement as 'income' | 'balance' | 'cashflow'
    if (grouped[key]) {
      grouped[key].push({
        id: r.id,
        period: r.period,
        periodType: r.periodType,
        source: r.source,
        sourceLabel: r.sourceLabel,
        currency: r.currency,
        data: r.data,
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
      })
    }
  }

  return NextResponse.json({ financials: grouped, total: rows.length })
}

// POST /api/private/financials
// Creates or replaces a financial statement period.
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const parsed = insertPrivateFinancialSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', details: parsed.error.flatten() }, { status: 422 })
  }

  const localOrgId = await resolveLocalOrgId(orgId)
  const vals = {
    orgId: localOrgId,
    coresignalId: parsed.data.coresignalId,
    companyName: parsed.data.companyName ?? '',
    statement: parsed.data.statement,
    periodType: parsed.data.periodType ?? 'annual',
    period: parsed.data.period,
    source: parsed.data.source ?? 'manual',
    sourceLabel: parsed.data.sourceLabel ?? null,
    currency: parsed.data.currency ?? 'USD',
    data: parsed.data.data,
    notes: parsed.data.notes ?? '',
  }

  const [row] = await withOrgContext(localOrgId, (tx) =>
    tx.insert(privateFinancialsTable)
      .values(vals)
      .onConflictDoUpdate({
        target: [
          privateFinancialsTable.orgId,
          privateFinancialsTable.coresignalId,
          privateFinancialsTable.statement,
          privateFinancialsTable.period,
          privateFinancialsTable.periodType,
        ],
        set: {
          data: vals.data,
          currency: vals.currency,
          source: vals.source,
          sourceLabel: vals.sourceLabel,
          notes: vals.notes,
          updatedAt: new Date(),
        },
      })
      .returning(),
  )

  return NextResponse.json({ financial: row }, { status: 201 })
}

// DELETE /api/private/financials?id=...
export async function DELETE(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)
  await withOrgContext(localOrgId, (tx) =>
    tx.delete(privateFinancialsTable)
      .where(and(
        eq(privateFinancialsTable.id, id),
        eq(privateFinancialsTable.orgId, localOrgId),
      )),
  )

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { desc, eq } from 'drizzle-orm'
import {
  withOrgContext,
  financialTemplatesTable,
  insertFinancialTemplateSchema,
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

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ templates: [], synced: false, reason: 'no_workspace' })

  const localOrgId = await resolveLocalOrgId(orgId)
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx.select()
      .from(financialTemplatesTable)
      .where(eq(financialTemplatesTable.orgId, localOrgId))
      .orderBy(desc(financialTemplatesTable.updatedAt))
      .limit(200),
  )
  return NextResponse.json({
    synced: true,
    currentUserId: userId,
    templates: rows.map(r => toDto(r, userId)),
  })
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = insertFinancialTemplateSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)
  const inserted = await withOrgContext(localOrgId, (tx) =>
    tx.insert(financialTemplatesTable)
      .values({
        orgId: localOrgId,
        authorUserId: userId,
        name: parsed.data.name,
        description: parsed.data.description ?? '',
        statementType: parsed.data.statementType,
        presentation: parsed.data.presentation ?? 'standardized',
        periodLayout: parsed.data.periodLayout ?? 'annual',
        numPeriods: parsed.data.numPeriods ?? 5,
        lineItems: parsed.data.lineItems as any,
      })
      .returning(),
  )
  return NextResponse.json({ template: toDto(inserted[0], userId) }, { status: 201 })
}

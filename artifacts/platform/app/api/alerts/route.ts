import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, desc, eq } from 'drizzle-orm'
import {
  withOrgContext,
  alertsTable,
  insertAlertSchema,
  patchAlertSchema,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// alerts.org_id is a UUID FK to organizations.id, so we resolve the Clerk
// org id → local UUID and run reads/writes inside `withOrgContext` so RLS
// (`app.current_org_id` GUC) restricts rows to the caller's workspace.

interface AlertDto {
  id: string
  symbol: string
  name: string
  type: string
  threshold: number
  currentVal: number
  triggered: boolean
  active: boolean
  note: string | null
  notifyEnabled: boolean
  notifyChannel: string
  lastNotifiedAt: string | null
  lastCheckedAt: string | null
  createdAt: string
  authorUserId: string
  mine: boolean
}

function toDto(r: typeof alertsTable.$inferSelect, currentUserId: string): AlertDto {
  return {
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    type: r.type,
    threshold: r.threshold,
    currentVal: r.currentVal,
    triggered: r.triggered,
    active: r.active,
    note: r.note,
    notifyEnabled: r.notifyEnabled,
    notifyChannel: r.notifyChannel,
    lastNotifiedAt: r.lastNotifiedAt ? r.lastNotifiedAt.toISOString() : null,
    lastCheckedAt: r.lastCheckedAt ? r.lastCheckedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    authorUserId: r.authorUserId,
    mine: r.authorUserId === currentUserId,
  }
}

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ alerts: [], synced: false, reason: 'no_workspace' })

  const localOrgId = await resolveLocalOrgId(orgId)
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx.select()
      .from(alertsTable)
      .where(eq(alertsTable.orgId, localOrgId))
      .orderBy(desc(alertsTable.createdAt))
      .limit(500),
  )
  return NextResponse.json({
    synced: true,
    currentUserId: userId,
    alerts: rows.map(r => toDto(r, userId)),
  })
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const obj = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {}
  const symRaw = obj.symbol
  const parsed = insertAlertSchema.safeParse({
    ...obj,
    symbol: typeof symRaw === 'string' ? symRaw.toUpperCase() : symRaw,
  })
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)
  const inserted = await withOrgContext(localOrgId, (tx) =>
    tx.insert(alertsTable)
      .values({
        orgId: localOrgId,
        authorUserId: userId,
        symbol: parsed.data.symbol,
        name: parsed.data.name ?? '',
        type: parsed.data.type,
        threshold: parsed.data.threshold ?? 0,
        currentVal: parsed.data.currentVal ?? 0,
        active: parsed.data.active ?? true,
        note: parsed.data.note,
        notifyEnabled: parsed.data.notifyEnabled ?? true,
        notifyChannel: parsed.data.notifyChannel ?? 'email',
      })
      .returning(),
  )
  return NextResponse.json({ alert: toDto(inserted[0], userId) }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = patchAlertSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() }
  if (typeof parsed.data.lastNotifiedAt === 'string') updates.lastNotifiedAt = new Date(parsed.data.lastNotifiedAt)
  else if (parsed.data.lastNotifiedAt === null) updates.lastNotifiedAt = null
  if (typeof parsed.data.lastCheckedAt === 'string') updates.lastCheckedAt = new Date(parsed.data.lastCheckedAt)
  else if (parsed.data.lastCheckedAt === null) updates.lastCheckedAt = null

  const localOrgId = await resolveLocalOrgId(orgId)
  const updated = await withOrgContext(localOrgId, (tx) =>
    tx.update(alertsTable)
      .set(updates)
      .where(and(eq(alertsTable.id, id), eq(alertsTable.authorUserId, userId)))
      .returning(),
  )
  if (!updated.length) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })
  return NextResponse.json({ alert: toDto(updated[0], userId) })
}

export async function DELETE(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)
  const removed = await withOrgContext(localOrgId, (tx) =>
    tx.delete(alertsTable)
      .where(and(eq(alertsTable.id, id), eq(alertsTable.authorUserId, userId)))
      .returning({ id: alertsTable.id }),
  )
  if (!removed.length) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })
  return NextResponse.json({ ok: true })
}

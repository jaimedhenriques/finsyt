import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import {
  getRecentNotifications,
  markNotificationsRead,
} from '@/lib/live-highlights'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ notifications: [], unreadCount: 0 })

  const notifications = await getRecentNotifications(orgId)
  return NextResponse.json({
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
  })
}

export async function PATCH(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let body: { ids?: unknown; markAll?: unknown } = {}
  try { body = await req.json() } catch { /* empty body */ }

  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : undefined
  if (body.markAll || (!ids && !body.ids)) {
    await markNotificationsRead(orgId)
  } else if (ids?.length) {
    await markNotificationsRead(orgId, ids)
  }
  const notifications = await getRecentNotifications(orgId)
  return NextResponse.json({
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
  })
}

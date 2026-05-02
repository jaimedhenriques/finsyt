import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import {
  getLiveHighlightsSettings,
  getRecentPins,
  getRecentNotifications,
  getActiveCallsFor,
} from '@/lib/live-highlights'
import { liveSelection, callKey, callHasEnded } from '@/lib/live-events-source'
import { getWatchlist } from '@/lib/watchlist-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const watchlist = await getWatchlist(orgId)
  const settings = await getLiveHighlightsSettings(orgId)
  const rawCalls = await getActiveCallsFor(orgId, watchlist)
  const activeCalls = rawCalls.map((c) => ({
    symbol: c.symbol,
    event: c.event,
    callKey: callKey(c),
    startedAt: c.startedAt,
    ended: callHasEnded(c),
  }))

  const [recentPins, recentNotifications] = await Promise.all([
    getRecentPins(orgId, 20),
    getRecentNotifications(orgId),
  ])

  return NextResponse.json({
    settings,
    watchlist,
    activeCalls,
    recentPins,
    recentNotifications,
    liveAll: liveSelection().map((c) => ({ symbol: c.symbol, name: c.name, event: c.event })),
  })
}

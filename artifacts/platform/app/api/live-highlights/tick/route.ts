import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { tickLiveHighlights } from '@/lib/live-highlights'
import { getWatchlist } from '@/lib/watchlist-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Driven by the AppShell-mounted `<LiveHighlightsTicker />` every ~30s. We
// intentionally make this a POST to keep CDNs / browser back-forward caches
// from re-firing pin writes.
export async function POST() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const watchlist = await getWatchlist(orgId)
  const result = await tickLiveHighlights({
    orgId,
    userId,
    watchlist,
  })
  return NextResponse.json(result)
}

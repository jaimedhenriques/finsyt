import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '@/lib/watchlist-store'
import { resolveEntitlementContext } from '@/lib/billing-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  return NextResponse.json({ watchlist: await getWatchlist(orgId) })
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const { symbol, action } = (await req.json().catch(() => ({}))) as { symbol?: unknown; action?: unknown }
  if (typeof symbol !== 'string' || !symbol) {
    return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  }

  if (action === 'remove') {
    return NextResponse.json({ watchlist: await removeFromWatchlist(orgId, symbol) })
  }

  // Enforce the Free-tier watchlist size cap server-side before adding.
  const ctx = await resolveEntitlementContext()
  const limit = ctx?.entitlements.watchlistLimit ?? null
  if (limit !== null && !ctx?.bypass) {
    const current = await getWatchlist(orgId)
    const normalized = symbol.toUpperCase().trim()
    if (!current.includes(normalized) && current.length >= limit) {
      return NextResponse.json(
        {
          error: 'upgrade_required',
          feature: 'watchlist',
          plan: ctx?.plan ?? 'free',
          limit,
          message: `The free plan is limited to ${limit} symbols in your watchlist. Upgrade to add more.`,
          upgradeUrl: '/platform/app/upgrade',
        },
        { status: 402 },
      )
    }
  }

  return NextResponse.json({ watchlist: await addToWatchlist(orgId, symbol) })
}

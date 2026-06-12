import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '@/lib/watchlist-store'

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
  const watchlist =
    action === 'remove'
      ? await removeFromWatchlist(orgId, symbol)
      : await addToWatchlist(orgId, symbol)
  return NextResponse.json({ watchlist })
}

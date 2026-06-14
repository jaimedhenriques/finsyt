import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/peers/me — minimal "who am I" endpoint that respects PLATFORM_OPEN_MODE.
// Used by the Peers UI to identify which sets are owner-editable. Avoids
// importing Clerk's useUser hook on the client (which returns null in open mode).
export async function GET() {
  const { userId, orgId } = await auth()
  return NextResponse.json({ userId: userId ?? null, orgId: orgId ?? null })
}

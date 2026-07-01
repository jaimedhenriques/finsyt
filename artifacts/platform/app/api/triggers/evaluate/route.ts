import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { evaluateAllTriggers } from '@/lib/event-trigger-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const INTERNAL_SECRET = process.env.INTERNAL_AUTH_SECRET

// POST /api/triggers/evaluate
// Evaluate all enabled event triggers for the authenticated workspace.
// Called from:
//   - Manual "Evaluate now" button in the UI (user session)
//   - A cron / background job (Bearer: INTERNAL_AUTH_SECRET)
export async function POST(req: NextRequest) {
  // Accept either an authenticated user session or an INTERNAL_AUTH_SECRET bearer.
  let orgId: string | null = null
  let userId: string | null = null

  const authHeader = req.headers.get('authorization')
  if (authHeader && INTERNAL_SECRET && authHeader === `Bearer ${INTERNAL_SECRET}`) {
    // Internal cron call: org + user specified in body.
    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
    const b = body as { orgId?: string; userId?: string }
    orgId = b.orgId ?? null
    userId = b.userId ?? null
    if (!orgId || !userId) {
      return NextResponse.json({ error: 'orgId + userId required in body for cron calls' }, { status: 400 })
    }
  } else {
    // User session call.
    const session = await auth()
    orgId = session.orgId ?? null
    userId = session.userId ?? null
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!orgId) return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  }

  const results = await evaluateAllTriggers(orgId, userId)
  const fired = results.filter((r) => r.fired).length
  return NextResponse.json({ ok: true, evaluated: results.length, fired, results })
}

import { NextRequest, NextResponse } from 'next/server'
import { refreshAllClusters } from '@/lib/question-clusters'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Backend job entrypoint. Wire to Vercel Cron / external scheduler:
//   { "crons": [{ "path": "/api/analyst-questions/refresh", "schedule": "0 */6 * * *" }] }
//
// Authentication: a shared secret is **always required**. Vercel Cron sets
// the `Authorization: Bearer $CRON_SECRET` header automatically when
// CRON_SECRET is configured as an environment variable; other schedulers
// must do the same. The refresh pipeline is expensive (FMP + Groq across
// the watchlist), so we also throttle to one execution per minute to
// guard against runaway invocations.
let lastRunAt = 0
const MIN_INTERVAL_MS = 60_000

export async function GET(req: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured; refresh job disabled' },
      { status: 503 }
    )
  }
  const auth = req.headers.get('authorization') || ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  if (now - lastRunAt < MIN_INTERVAL_MS) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterMs: MIN_INTERVAL_MS - (now - lastRunAt) },
      { status: 429 }
    )
  }
  lastRunAt = now

  const result = await refreshAllClusters()
  return NextResponse.json({ ok: true, ...result, refreshedAt: new Date().toISOString() })
}

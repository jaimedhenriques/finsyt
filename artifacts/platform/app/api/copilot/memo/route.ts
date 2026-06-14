import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { requireFeature } from '@/lib/billing-server'
import { generateInvestmentMemo, MemoGenerationError } from '@/lib/memo-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── Simple in-process per-user rate limit (10 generations / 5 minutes) ─────
const RATE_WINDOW_MS = 5 * 60 * 1000
const RATE_MAX = 10
const rateBuckets = new Map<string, { count: number; resetAt: number }>()
function checkRate(key: string): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const b = rateBuckets.get(key)
  if (!b || b.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return { ok: true, remaining: RATE_MAX - 1, resetAt: now + RATE_WINDOW_MS }
  }
  if (b.count >= RATE_MAX) return { ok: false, remaining: 0, resetAt: b.resetAt }
  b.count += 1
  return { ok: true, remaining: RATE_MAX - b.count, resetAt: b.resetAt }
}

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/

/**
 * POST /api/copilot/memo
 * Body: { ticker: string }
 *
 * Thin REST wrapper around `generateInvestmentMemo` (lib/memo-service.ts).
 * The agent-intent SSE path in /api/agent/ask shares the same service so
 * the assembler / builder / store / audit sequence stays in lockstep.
 */
export async function POST(req: NextRequest) {
  const gate = await requireFeature('export')
  if (!gate.ok) return gate.response!
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized — sign in to generate decks.' }, { status: 401 })
  }

  let body: { ticker?: string } = {}
  try { body = await req.json() } catch { /* empty body is handled below */ }
  const tickerRaw = (body.ticker || '').toString().trim().toUpperCase()
  if (!tickerRaw) {
    return NextResponse.json({ error: 'ticker required' }, { status: 400 })
  }
  if (!TICKER_RE.test(tickerRaw)) {
    return NextResponse.json({ error: `"${tickerRaw}" doesn't look like a US-listed ticker. Try a symbol like MSFT or NVDA.` }, { status: 400 })
  }

  const rate = checkRate(userId)
  if (!rate.ok) {
    const wait = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))
    return NextResponse.json({
      error: 'Rate limit exceeded. Please wait before generating another deck.',
      retryAfterSeconds: wait,
    }, { status: 429, headers: { 'Retry-After': String(wait) } })
  }

  const basePath = req.nextUrl.basePath || process.env.NEXT_PUBLIC_BASE_PATH || ''
  const baseUrl = `${req.nextUrl.origin}${basePath}`

  let result
  try {
    result = await generateInvestmentMemo({
      baseUrl,
      ticker: tickerRaw,
      userId,
      orgId: orgId || null,
      source: 'copilot_memo_endpoint',
    })
  } catch (e) {
    if (e instanceof MemoGenerationError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  return NextResponse.json({
    fileId:      result.fileId,
    filename:    result.filename,
    bytes:       result.bytes,
    expiresAt:   result.expiresAt,
    downloadUrl: `${basePath}/api/copilot/memo/${result.fileId}`,
    ticker:      result.ticker,
    companyName: result.companyName,
    asOf:        result.asOf,
    sourceLine:  result.sourceLine,
    slideTitles: result.slideTitles,
    thumbnails:  result.thumbnails,
    rateLimit:   { remaining: rate.remaining, resetAt: rate.resetAt },
  }, {
    headers: {
      'X-RateLimit-Limit':     String(RATE_MAX),
      'X-RateLimit-Remaining': String(rate.remaining),
      'X-RateLimit-Reset':     String(Math.max(0, Math.ceil((rate.resetAt - Date.now()) / 1000))),
    },
  })
}

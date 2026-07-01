/**
 * POST /api/copilot/word
 * ──────────────────────
 * Generates a branded Word (.docx) investment memo for a given ticker and
 * streams it back as a direct download. Uses the same memo-data assembler
 * as the PPTX route so the content is identical across both formats.
 *
 * Body:  { ticker: string }
 * Response: application/vnd.openxmlformats-officedocument.wordprocessingml.document
 *           (binary download)
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { assembleInvestmentMemoData } from '@/lib/investment-memo-data'
import { buildWordMemo } from '@/lib/word-memo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/

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

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized — sign in to generate documents.' }, { status: 401 })
  }

  let body: { ticker?: string } = {}
  try { body = await req.json() } catch { /* empty */ }

  const tickerRaw = (body.ticker || '').toString().trim().toUpperCase()
  if (!tickerRaw || !TICKER_RE.test(tickerRaw)) {
    return NextResponse.json(
      { error: `"${tickerRaw || ''}" doesn't look like a valid ticker. Try a symbol like MSFT or NVDA.` },
      { status: 400 }
    )
  }

  const rate = checkRate(userId)
  if (!rate.ok) {
    const wait = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before generating another document.', retryAfterSeconds: wait },
      { status: 429, headers: { 'Retry-After': String(wait) } }
    )
  }

  const basePath = req.nextUrl.basePath || process.env.NEXT_PUBLIC_BASE_PATH || ''
  const baseUrl  = `${req.nextUrl.origin}${basePath}`

  try {
    const memo = await assembleInvestmentMemoData(baseUrl, tickerRaw)
    const buffer = await buildWordMemo(memo)

    const filename = `${memo.identity.ticker} Investment Memo.docx`.replace(/[\\/:*?"<>|]/g, '_')

    console.log(JSON.stringify({
      event: 'copilot_word_generated',
      userId,
      ticker: tickerRaw,
      bytes: buffer.byteLength,
    }))

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'private, no-store',
        'X-RateLimit-Remaining': String(rate.remaining),
        'X-Ticker': tickerRaw,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Word memo generation failed' }, { status: 500 })
  }
}

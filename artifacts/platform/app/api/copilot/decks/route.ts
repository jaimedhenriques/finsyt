/**
 * GET /api/copilot/decks
 * ──────────────────────
 * Lists the current user's recent deck generations so the platform can
 * show a "Recent decks" panel and let users re-download a previously
 * generated PPTX (until its TTL expires) without paying to regenerate
 * — saves an upstream data fetch and a rate-limit slot per re-pull.
 *
 * Response: { items: Array<{
 *   fileId, filename, ticker, template, slides,
 *   createdAt, expiresAt, bytes, expired, downloadUrl
 * }>}
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { listForUser } from '@/lib/memo-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const basePath = req.nextUrl.basePath || process.env.NEXT_PUBLIC_BASE_PATH || ''
  const now = Date.now()

  let items
  try {
    const memos = await listForUser(userId, 20)
    items = memos.map((m) => ({
      fileId:      m.fileId,
      filename:    m.filename,
      ticker:      m.ticker,
      template:    m.template,
      slides:      m.slides,
      createdAt:   m.createdAt,
      expiresAt:   m.expiresAt,
      bytes:       m.bytes,
      expired:     !m.expiresAt || m.expiresAt < now,
      downloadUrl: `${basePath}/api/copilot/memo/${m.fileId}`,
    }))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Failed to list decks' }, { status: 500 })
  }

  return NextResponse.json({ items }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

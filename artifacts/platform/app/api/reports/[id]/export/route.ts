/**
 * POST /api/reports/[id]/export
 * ─────────────────────────────
 * Export a saved report to PPTX or PDF. Loads the report + ordered blocks under
 * the caller's org context (RLS-scoped), assembles a `DeckTemplate` from live
 * platform data (`assembleReportDeck`), renders it, and stashes the artifact in
 * the same App Storage bucket the memo / deck routes use so it downloads via
 * /api/copilot/memo/<fileId>.
 *
 * Body: { format?: 'pptx' | 'pdf' }   (default 'pptx')
 * Returns: { format, fileId, downloadUrl, filename, bytes, expiresAt }
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, asc, eq } from 'drizzle-orm'
import {
  withClerkContext,
  reportsTable,
  reportBlocksTable,
} from '@workspace/db'
import { putMemo } from '@/lib/memo-store'
import { requireFeature } from '@/lib/billing-server'
import { renderDeck, deckSlideTitles } from '@/lib/deck-service'
import { assembleReportDeck, type ReportForDeck } from '@/lib/report-data'
import { renderReportPdf } from '@/lib/report-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Light per-user rate limit — export triggers many upstream fetches + a render.
const RATE_WINDOW_MS = 5 * 60 * 1000
const RATE_MAX = 15
const rateBuckets = new Map<string, { count: number; resetAt: number }>()
function checkRate(key: string): boolean {
  const now = Date.now()
  const b = rateBuckets.get(key)
  if (!b || b.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (b.count >= RATE_MAX) return false
  b.count += 1
  return true
}

function sanitiseName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'Report'
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireFeature('export')
  if (!gate.ok) return gate.response!
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 409 })

  if (!checkRate(userId)) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please wait before exporting again.' }, { status: 429 })
  }

  let body: { format?: string } = {}
  try { body = await req.json() } catch { /* default below */ }
  const format = body.format === 'pdf' ? 'pdf' : 'pptx'

  // Load the report + blocks under RLS.
  const report = await withClerkContext(orgId, userId, async (tx) => {
    const rows = await tx
      .select()
      .from(reportsTable)
      .where(and(eq(reportsTable.id, id), eq(reportsTable.orgId, orgId)))
      .limit(1)
    if (rows.length === 0) return null
    const r = rows[0]
    const blocks = await tx
      .select()
      .from(reportBlocksTable)
      .where(and(eq(reportBlocksTable.orgId, orgId), eq(reportBlocksTable.reportId, id)))
      .orderBy(asc(reportBlocksTable.position))
    return { row: r, blocks }
  })

  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

  const basePath = req.nextUrl.basePath || process.env.NEXT_PUBLIC_BASE_PATH || ''
  const baseUrl = `${req.nextUrl.origin}${basePath}`

  const forDeck: ReportForDeck = {
    title: report.row.title,
    subtitle: report.row.subtitle,
    symbol: report.row.symbol,
    blocks: report.blocks.map((b) => ({
      kind: b.kind,
      config: (b.config && typeof b.config === 'object' ? b.config : {}) as Record<string, unknown>,
      position: b.position,
    })),
  }

  try {
    const tpl = await assembleReportDeck(baseUrl, forDeck)

    let buffer: Buffer
    let filename: string
    let slides: number
    if (format === 'pdf') {
      buffer = await renderReportPdf(tpl)
      filename = `${sanitiseName(report.row.title)}.pdf`
      slides = tpl.sections.length
    } else {
      buffer = await renderDeck(tpl)
      filename = `${sanitiseName(report.row.title)}.pptx`
      slides = deckSlideTitles(tpl).length
    }

    const { fileId, expiresAt, bytes } = await putMemo({
      buffer,
      filename,
      ticker: report.row.symbol || 'REPORT',
      userId,
      template: `report-${format}`,
      slides,
      contentType: format === 'pdf' ? 'application/pdf' : undefined,
      ext: format === 'pdf' ? 'pdf' : undefined,
    })

    return NextResponse.json({
      format,
      fileId,
      filename,
      bytes,
      expiresAt,
      downloadUrl: `${basePath}/api/copilot/memo/${fileId}`,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Export failed' }, { status: 500 })
  }
}

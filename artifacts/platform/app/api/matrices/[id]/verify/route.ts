/**
 * GET /api/matrices/[id]/verify[?snapshotId=…][&rowIds=…]
 * ──────────────────────────────────────────────────────
 * Pre-export verification for a research matrix. Builds the same
 * `MatrixExportData` the export route renders, runs the pure verification
 * engine over it (formula/reference errors, missing citations, house-style
 * terminology), and returns the structured `VerificationReport` so the matrix
 * page can render a click-through review pane before the analyst exports.
 *
 * Reading is RLS-scoped via `withOrgContext`; the org's house style is loaded
 * Clerk-scoped via `getHouseStyle`. A successful verification is written to the
 * audit trail so the deliverable's review status is part of its provenance.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import { withOrgContext, matricesTable, matrixSnapshotsTable, audit } from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'
import type {
  MatrixExportData,
  MatrixExportRow,
  MatrixExportColumn,
  MatrixExportCell,
} from '@/lib/matrix-pptx'
import { verifyMatrix } from '@/lib/deliverable-verification'
import { getHouseStyle } from '@/lib/house-style'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await params
  const snapshotId = req.nextUrl.searchParams.get('snapshotId')
  const rowIdsParam = req.nextUrl.searchParams.getAll('rowIds')
  const rowIdsFilter = rowIdsParam.length > 0 ? new Set(rowIdsParam) : null

  const localOrgId = await resolveLocalOrgId(orgId)
  const grid = await withOrgContext(localOrgId, async (tx) => {
    const m = await tx.select().from(matricesTable)
      .where(and(eq(matricesTable.id, id), eq(matricesTable.orgId, localOrgId))).limit(1)
    if (!m.length) return null
    const matrix = m[0]
    let rows = (Array.isArray(matrix.rows) ? matrix.rows : []) as MatrixExportRow[]
    let cols = (Array.isArray(matrix.columns) ? matrix.columns : []) as MatrixExportColumn[]
    let cells = (matrix.cells && typeof matrix.cells === 'object' ? matrix.cells : {}) as Record<string, MatrixExportCell>
    if (snapshotId) {
      const snap = await tx.select().from(matrixSnapshotsTable)
        .where(and(
          eq(matrixSnapshotsTable.id, snapshotId),
          eq(matrixSnapshotsTable.matrixId, matrix.id),
          eq(matrixSnapshotsTable.orgId, localOrgId),
        ))
        .limit(1)
      if (snap.length) {
        rows  = (Array.isArray(snap[0].rows)    ? snap[0].rows    : rows) as MatrixExportRow[]
        cols  = (Array.isArray(snap[0].columns) ? snap[0].columns : cols) as MatrixExportColumn[]
        cells = (snap[0].cells && typeof snap[0].cells === 'object' ? snap[0].cells : cells) as Record<string, MatrixExportCell>
      }
    }
    return { matrix, rows, cols, cells }
  })

  if (!grid) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const exportRows = rowIdsFilter
    ? grid.rows.filter((r) => rowIdsFilter.has(r.id))
    : grid.rows
  const rowsForCheck = exportRows.length > 0 ? exportRows : grid.rows

  const data: MatrixExportData = {
    name: grid.matrix.name,
    description: grid.matrix.description ?? undefined,
    generatedAt: new Date().toISOString(),
    rows: rowsForCheck,
    columns: grid.cols,
    cells: grid.cells,
  }

  const houseStyle = await getHouseStyle(orgId, userId)
  const report = verifyMatrix(data, { houseStyle })

  // Provenance: record that the deliverable was verified and with what result.
  try {
    await audit.log({
      orgId,
      actorId: userId,
      actorType: 'user',
      action: 'deliverable.verified',
      resourceType: 'matrix',
      resourceId: id,
      metadata: {
        deliverable: 'matrix',
        snapshotId: snapshotId ?? null,
        passed: report.passed,
        houseStyleApplied: report.houseStyleApplied,
        summary: report.summary,
      },
    })
  } catch {
    /* swallow — audit failure must not block the review */
  }

  return NextResponse.json({ report })
}

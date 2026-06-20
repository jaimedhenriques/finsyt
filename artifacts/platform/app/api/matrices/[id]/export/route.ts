import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import { withOrgContext, matricesTable, matrixSnapshotsTable } from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'
import { requireFeature } from '@/lib/billing-server'
import {
  buildMatrixCsv,
  buildMatrixPptx,
  type MatrixExportData,
  type MatrixExportRow,
  type MatrixExportColumn,
  type MatrixExportCell,
} from '@/lib/matrix-pptx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams { params: Promise<{ id: string }> }

function safeFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._ -]+/g, '').replace(/\s+/g, '_').slice(0, 80) || 'matrix'
}

// GET /api/matrices/[id]/export?format=csv|pptx[&snapshotId=…]
// Renders the live matrix or a frozen snapshot. The snapshot path supports
// "send the December freeze to the IC" workflows where the live grid has
// already moved on.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const gate = await requireFeature('export')
  if (!gate.ok) return gate.response!
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await params
  const format = (req.nextUrl.searchParams.get('format') || 'csv').toLowerCase()
  const snapshotId = req.nextUrl.searchParams.get('snapshotId')
  // Task #267 — analysts can scope a PPTX export to just the rows they
  // checked in the grid by passing repeated `rowIds=<id>` query params.
  // When omitted (or empty), the full grid is exported (legacy behavior).
  const rowIdsParam = req.nextUrl.searchParams.getAll('rowIds')
  const rowIdsFilter = rowIdsParam.length > 0 ? new Set(rowIdsParam) : null

  if (format !== 'csv' && format !== 'pptx') {
    return NextResponse.json({ error: 'format must be csv or pptx' }, { status: 400 })
  }

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

  const filteredRows = rowIdsFilter
    ? grid.rows.filter((r) => rowIdsFilter.has(r.id))
    : grid.rows
  // If the caller passed rowIds but none matched current rows, fall back to
  // the full grid rather than emitting an empty deck — this can happen if a
  // selected row was deleted between selection and export.
  const exportRows = filteredRows.length > 0 ? filteredRows : grid.rows

  const data: MatrixExportData = {
    name: grid.matrix.name,
    description: grid.matrix.description,
    generatedAt: new Date().toISOString(),
    rows: exportRows,
    columns: grid.cols,
    cells: grid.cells,
  }
  const baseName = safeFilename(grid.matrix.name)

  if (format === 'csv') {
    const csv = buildMatrixCsv(data)
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${baseName}.csv"`,
      },
    })
  }
  const buf = await buildMatrixPptx(data)
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${baseName}.pptx"`,
    },
  })
}

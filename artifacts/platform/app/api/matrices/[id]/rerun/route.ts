import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import { withOrgContext, matricesTable, type MatrixCellPayload } from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams { params: Promise<{ id: string }> }

const RerunSchema = z.object({
  // Specific cells to mark dirty: ["rowId.colId", …]. If omitted, mark all
  // cells that touch the supplied row(s) or column(s) as dirty.
  cellKeys: z.array(z.string().max(140)).max(2000).optional(),
  rowIds:   z.array(z.string().max(64)).max(200).optional(),
  colIds:   z.array(z.string().max(64)).max(40).optional(),
  // When triggered by a filing event we record the trigger reason on the
  // matrix so the next foreground load can surface "X cells refreshed by
  // 8-K filed 2026-04-12".
  reason: z.string().max(200).optional(),
})

// POST /api/matrices/[id]/rerun
// Marks the requested cells as `dirty: true` so the foreground page will
// re-stream them on next render. The actual model invocation happens in
// the browser via /api/agent/ask — this endpoint is the cheap, idempotent
// queue trigger that the alert pipeline (and the user's Re-run button) call.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  const { id } = await params

  let raw: unknown = {}
  try { raw = await req.json() } catch { /* allow empty */ }
  const parsed = RerunSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)
  const result = await withOrgContext(localOrgId, async (tx) => {
    const m = await tx.select().from(matricesTable)
      .where(and(eq(matricesTable.id, id), eq(matricesTable.orgId, localOrgId))).limit(1)
    if (!m.length) return null
    const matrix = m[0]
    const rows = Array.isArray(matrix.rows) ? matrix.rows as Array<{ id: string }> : []
    const cols = Array.isArray(matrix.columns) ? matrix.columns as Array<{ id: string }> : []
    const cells = (matrix.cells && typeof matrix.cells === 'object'
      ? matrix.cells
      : {}) as Record<string, MatrixCellPayload>

    // Build the set of cell keys to dirty.
    const targets = new Set<string>()
    if (parsed.data.cellKeys?.length) for (const k of parsed.data.cellKeys) targets.add(k)
    if (parsed.data.rowIds?.length) {
      for (const rid of parsed.data.rowIds) for (const c of cols) targets.add(`${rid}.${c.id}`)
    }
    if (parsed.data.colIds?.length) {
      for (const cid of parsed.data.colIds) for (const r of rows) targets.add(`${r.id}.${cid}`)
    }
    if (targets.size === 0) {
      // No specific scope → re-run everything.
      for (const r of rows) for (const c of cols) targets.add(`${r.id}.${c.id}`)
    }

    let n = 0
    for (const key of targets) {
      const prev = cells[key]
      cells[key] = { ...(prev || { state: 'idle' }), dirty: true }
      n++
    }
    const updated = await tx.update(matricesTable)
      .set({ cells, updatedAt: new Date() })
      .where(and(eq(matricesTable.id, id), eq(matricesTable.orgId, localOrgId)))
      .returning({ id: matricesTable.id })
    return { dirtied: n, ok: !!updated.length }
  })

  if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: result.ok, dirtied: result.dirtied, reason: parsed.data.reason || null })
}

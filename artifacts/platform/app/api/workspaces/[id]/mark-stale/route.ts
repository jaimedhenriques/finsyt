import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth-server'
import {
  withOrgContext,
  workspacesTable,
  auditLog,
  dealMetadataSchema,
  type DealWorkspaceMetadata,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/workspaces/[id]/mark-stale  { surfaces, reason? }
//
// Cross-surface bindings hook. Called from the peer-set editor (and any other
// surface that mutates inputs) to mark downstream artefacts stale so the deal
// workspace shows a "Refresh memo / deck" callout. The actual regeneration is
// kicked off explicitly by the analyst — we never silently re-run expensive
// AI generations.

const SURFACES = ['memo', 'deck', 'valuation'] as const

const bodySchema = z.object({
  surfaces: z.array(z.enum(SURFACES)).min(1).max(SURFACES.length),
  reason: z.string().max(280).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const { id } = await Promise.resolve(params)
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  const localOrgId = await resolveLocalOrgId(orgId)

  const updated = await withOrgContext(localOrgId, async (tx) => {
    const rows = await tx
      .select()
      .from(workspacesTable)
      .where(and(eq(workspacesTable.id, id), eq(workspacesTable.orgId, localOrgId)))
      .limit(1)
    if (rows.length === 0) return null
    if (rows[0].kind !== 'deal') return rows[0] // no-op for non-deal workspaces

    const metaParse = dealMetadataSchema.safeParse(rows[0].metadata)
    const baseMeta: DealWorkspaceMetadata = metaParse.success
      ? metaParse.data
      : {
          templateVersion: 1,
          targetSymbol: rows[0].targetSymbol ?? 'UNKNOWN',
          staleSurfaces: [],
        }
    const merged = new Set<typeof SURFACES[number]>([...(baseMeta.staleSurfaces ?? []), ...parsed.data.surfaces])
    const next: DealWorkspaceMetadata = {
      ...baseMeta,
      staleSurfaces: Array.from(merged),
    }
    const [row] = await tx
      .update(workspacesTable)
      .set({ metadata: next, updatedAt: new Date() })
      .where(and(eq(workspacesTable.id, id), eq(workspacesTable.orgId, localOrgId)))
      .returning()
    return row
  })

  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'workspace.deal.surfaces.stale',
    resourceType: 'workspace',
    resourceId: id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    metadata: { surfaces: parsed.data.surfaces, reason: parsed.data.reason ?? null },
  })

  return NextResponse.json({
    ok: true,
    metadata: updated.metadata,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { auth } from '@/lib/auth-server'
import {
  withOrgContext,
  withClerkContext,
  workspacesTable,
  peerSetsTable,
  peerSetMembersTable,
  auditLog,
  dealMetadataSchema,
  type DealWorkspaceMetadata,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Clone supports both target shapes (mirrors POST /api/workspaces/deal-team):
// a public ticker or a private-company UUID. At least one must be supplied.
const bodySchema = z
  .object({
    targetSymbol: z
      .string()
      .min(1)
      .max(12)
      .transform((s) => s.toUpperCase().trim())
      .optional(),
    targetCompanyId: z.string().uuid().optional(),
    targetName: z.string().min(1).max(200).optional(),
    name: z.string().min(1).max(120).optional(),
  })
  .refine((v) => Boolean(v.targetSymbol || v.targetCompanyId), {
    message: 'targetSymbol or targetCompanyId is required',
    path: ['targetSymbol'],
  })

// POST /api/workspaces/[id]/clone — duplicates a deal-team workspace against
// a new target symbol. Copies the peer-set member list (so the analyst keeps
// the curated basket) but resets the blueprint queue so the playbooks run
// fresh against the new target. Comments and chat history are intentionally
// NOT copied — Clone-for-new-target is for kicking off a new deal cycle, not
// branching the conversation.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const { id: sourceId } = await Promise.resolve(params)
  if (!sourceId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })
  }
  const { targetSymbol, targetCompanyId, targetName } = parsed.data
  if (targetSymbol && !TICKER_RE.test(targetSymbol)) {
    return NextResponse.json({ error: 'invalid ticker' }, { status: 400 })
  }
  if (targetCompanyId && !UUID_RE.test(targetCompanyId)) {
    return NextResponse.json({ error: 'invalid targetCompanyId' }, { status: 400 })
  }
  // Display label for the new workspace + peer set name.
  const targetLabel =
    targetSymbol || targetName || (targetCompanyId ? `private:${targetCompanyId.slice(0, 8)}` : 'TARGET')

  const localOrgId = await resolveLocalOrgId(orgId)

  // 1. Read source workspace + verify it exists in this org.
  const sourceRows = await withOrgContext(localOrgId, (tx) =>
    tx.select().from(workspacesTable).where(
      and(eq(workspacesTable.id, sourceId), eq(workspacesTable.orgId, localOrgId)),
    ).limit(1),
  )
  if (sourceRows.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const source = sourceRows[0]
  if (source.kind !== 'deal') {
    return NextResponse.json({ error: 'only deal workspaces can be cloned' }, { status: 400 })
  }

  const sourceMeta = dealMetadataSchema.safeParse(source.metadata)
  if (!sourceMeta.success) {
    return NextResponse.json({ error: 'source workspace metadata is malformed' }, { status: 422 })
  }

  // 2. Clone the peer set (members carry over, but the new set lives under
  //    its own row so changes don't bleed back to the source workspace).
  const newPeerSet = await withClerkContext(orgId, userId, async (tx) => {
    let sourceSymbols: string[] = []
    if (sourceMeta.data.peerSetId) {
      const members = await tx
        .select()
        .from(peerSetMembersTable)
        .where(and(
          eq(peerSetMembersTable.orgId, orgId),
          inArray(peerSetMembersTable.setId, [sourceMeta.data.peerSetId]),
        ))
      sourceSymbols = members
        .sort((a, b) => a.position - b.position)
        .map((m) => m.symbol.toUpperCase())
    }

    const [row] = await tx
      .insert(peerSetsTable)
      .values({
        orgId,
        authorUserId: userId,
        name: `${targetLabel} deal peers`,
        description: `Cloned from ${source.targetSymbol ?? 'previous deal'} for the ${targetLabel} cycle.`,
      })
      .returning()
    if (sourceSymbols.length > 0) {
      await tx.insert(peerSetMembersTable).values(
        sourceSymbols.map((symbol, i) => ({ setId: row.id, orgId, symbol, position: i })),
      )
    }
    return { row, symbolCount: sourceSymbols.length }
  })

  // 3. Build new metadata: keep template version + reset queue to "queued".
  const queuedAt = Date.now()
  const newMeta: DealWorkspaceMetadata = {
    templateVersion: sourceMeta.data.templateVersion,
    ...(targetSymbol ? { targetSymbol } : {}),
    ...(targetCompanyId ? { targetCompanyId } : {}),
    ...(targetName ? { targetName } : {}),
    peerSetId: newPeerSet.row.id,
    blueprintQueue: (sourceMeta.data.blueprintQueue ?? []).map((b) => ({
      slug: b.slug,
      label: b.label,
      status: 'queued' as const,
      queuedAt,
    })),
    // Cloned cycles need fresh memo/deck/valuation for the new target,
    // so all three start as draft (stale) review items.
    staleSurfaces: ['memo', 'deck', 'valuation'],
    clonedFromWorkspaceId: source.id,
  }

  const wsName = parsed.data.name?.trim() || `${targetLabel} deal team`

  const [cloned] = await withOrgContext(localOrgId, (tx) =>
    tx.insert(workspacesTable)
      .values({
        orgId: localOrgId,
        authorUserId: userId,
        name: wsName,
        description: source.description, // mission/notes carry over verbatim
        kind: 'deal',
        targetSymbol: targetSymbol ?? null,
        metadata: newMeta,
        color: source.color,
        tags: Array.isArray(source.tags)
          ? Array.from(new Set([...(source.tags as string[]).filter((t) => t !== source.targetSymbol), 'deal-team', targetLabel]))
          : ['deal-team', targetLabel],
      })
      .returning(),
  )

  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'workspace.deal.cloned',
    resourceType: 'workspace',
    resourceId: cloned.id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    metadata: {
      sourceWorkspaceId: source.id,
      sourceTargetSymbol: source.targetSymbol,
      newTargetSymbol: targetSymbol ?? null,
      newTargetCompanyId: targetCompanyId ?? null,
      peerCount: newPeerSet.symbolCount,
    },
  })

  return NextResponse.json({
    workspace: {
      id: cloned.id,
      name: cloned.name,
      kind: cloned.kind,
      targetSymbol: cloned.targetSymbol,
      metadata: cloned.metadata,
      createdAt: cloned.createdAt.toISOString(),
    },
  }, { status: 201 })
}

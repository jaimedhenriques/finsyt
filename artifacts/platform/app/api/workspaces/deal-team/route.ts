import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth-server'
import {
  withOrgContext,
  withClerkContext,
  workspacesTable,
  peerSetsTable,
  peerSetMembersTable,
  auditLog,
  type DealWorkspaceMetadata,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/workspaces/deal-team
// Scaffolds a complete deal-team workspace bound to a target ticker:
//   • a workspace row with kind="deal" + metadata.targetSymbol
//   • a peer set seeded from FMP stock-peers (best-effort; empty if FMP down)
//   • a recommended Blueprint queue (ic-memo, sector-landscape, peers, calls)
//   • cross-surface stale flags initialised to []
//
// Idempotency: callers should treat each POST as a brand-new workspace.

const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A deal target is either a public-equity ticker (`targetSymbol`) or a
// private-company id from `private_companies` (`targetCompanyId`). At least
// one must be supplied; both is allowed for cross-listed shells.
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
    description: z.string().max(500).optional(),
  })
  .refine((v) => Boolean(v.targetSymbol || v.targetCompanyId), {
    message: 'targetSymbol or targetCompanyId is required',
    path: ['targetSymbol'],
  })

const FMP = process.env.FINANCIAL_MODELING_PREP_API_KEY || process.env.FMP_API_KEY || ''

// Best-effort lightweight peer fetch: same shapes as
// lib/investment-memo-data.ts#fetchPeerTickers, but kept inline so the
// scaffolding route doesn't pull the whole memo-data graph.
async function fetchPeerTickers(ticker: string): Promise<string[]> {
  if (!FMP) return []
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/stock-peers?symbol=${encodeURIComponent(ticker)}&apikey=${FMP}`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return []
    const data: unknown = await res.json()
    if (!Array.isArray(data) || data.length === 0) return []
    const first = data[0] as Record<string, unknown>
    if (Array.isArray(first?.peersList)) return (first.peersList as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 8)
    if (Array.isArray(first?.peers))      return (first.peers as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 8)
    if (typeof first?.symbol === 'string') {
      return data
        .map((x: unknown) => (x as { symbol?: unknown })?.symbol)
        .filter((s): s is string => typeof s === 'string')
        .slice(0, 8)
    }
    return []
  } catch {
    return []
  }
}

// The blueprints we drop into the queue by default. Slugs match
// lib/blueprint-seeds.ts so the run UI can resolve them by published slug.
const DEFAULT_QUEUE_SLUGS: Array<{ slug: string; label: string }> = [
  { slug: 'ic-memo',                  label: 'IC memo (3 weeks of work in 12 minutes)' },
  { slug: 'expert-call-summary',      label: 'Expert-call summary' },
  { slug: 'peer-cycle-compilation',   label: 'Peer cycle compilation' },
  { slug: 'sector-landscape',         label: 'Sector landscape map' },
]

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

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

  // The display label drives the peer-set name + workspace name. Tickers win
  // when present (deals on listed names anchor on the symbol); private
  // company deals fall back to targetName, then a short id slug.
  const targetLabel =
    targetSymbol || targetName || (targetCompanyId ? `private:${targetCompanyId.slice(0, 8)}` : 'TARGET')

  // 1. Resolve peer set members. For public tickers, best-effort FMP lookup;
  //    private-company deals get an empty peer basket (the team curates it
  //    manually from the Peers tab).
  const peerSymbols = targetSymbol ? await fetchPeerTickers(targetSymbol) : []

  // 2. Create the peer set in the Clerk-id-keyed peer_sets table. The peer
  //    set is the cross-surface anchor that valuation/memo/deck all read
  //    from, so it must exist before the workspace metadata is committed.
  const peerSetName = `${targetLabel} deal peers`
  const peerSet = await withClerkContext(orgId, userId, async (tx) => {
    const [row] = await tx
      .insert(peerSetsTable)
      .values({
        orgId,
        authorUserId: userId,
        name: peerSetName,
        description: `Auto-seeded peer basket for the ${targetLabel} deal workspace.`,
      })
      .returning()
    if (peerSymbols.length > 0) {
      const seen = new Set<string>()
      const values = peerSymbols
        .filter((s) => { const u = s.toUpperCase(); if (seen.has(u)) return false; seen.add(u); return true })
        .map((symbol, i) => ({ setId: row.id, orgId, symbol: symbol.toUpperCase(), position: i }))
      if (values.length > 0) {
        await tx.insert(peerSetMembersTable).values(values)
      }
    }
    return row
  })

  // 3. Build the metadata blob and insert the deal workspace.
  //    Scaffolded surfaces (memo, deck, valuation) are seeded as draft
  //    placeholders: no fileId, marked stale so the UI immediately surfaces
  //    them as "needs first generation" review items for the team.
  const queuedAt = Date.now()
  const metadata: DealWorkspaceMetadata = {
    templateVersion: 1,
    ...(targetSymbol ? { targetSymbol } : {}),
    ...(targetCompanyId ? { targetCompanyId } : {}),
    ...(targetName ? { targetName } : {}),
    peerSetId: peerSet.id,
    blueprintQueue: DEFAULT_QUEUE_SLUGS.map((b) => ({
      slug: b.slug,
      label: b.label,
      status: 'queued' as const,
      queuedAt,
    })),
    staleSurfaces: ['memo', 'deck', 'valuation'],
  }

  const localOrgId = await resolveLocalOrgId(orgId)
  const wsName = parsed.data.name?.trim() || `${targetLabel} deal team`
  const wsDescription = parsed.data.description?.trim()
    || `Deal-team workspace for ${targetLabel}: notebook, peers, valuation, memo and deck linked to the same target.`
  const tags = ['deal-team', targetLabel]

  const [inserted] = await withOrgContext(localOrgId, (tx) =>
    tx.insert(workspacesTable)
      .values({
        orgId: localOrgId,
        authorUserId: userId,
        name: wsName,
        description: wsDescription,
        kind: 'deal',
        targetSymbol: targetSymbol ?? null,
        metadata,
        tags,
      })
      .returning(),
  )

  // 4. Emit audit event. Failures are swallowed inside auditLog.
  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'workspace.deal.created',
    resourceType: 'workspace',
    resourceId: inserted.id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    metadata: {
      targetSymbol: targetSymbol ?? null,
      targetCompanyId: targetCompanyId ?? null,
      peerSetId: peerSet.id,
      peerCount: peerSymbols.length,
      queueSize: DEFAULT_QUEUE_SLUGS.length,
    },
  })

  return NextResponse.json({
    workspace: {
      id: inserted.id,
      name: inserted.name,
      kind: inserted.kind,
      targetSymbol: inserted.targetSymbol,
      metadata: inserted.metadata,
      createdAt: inserted.createdAt.toISOString(),
    },
    peerSet: {
      id: peerSet.id,
      name: peerSet.name,
      symbols: peerSymbols.map((s) => s.toUpperCase()),
    },
  }, { status: 201 })
}

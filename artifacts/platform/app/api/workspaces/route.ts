import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { auth } from '@/lib/auth-server'
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import {
  withOrgContext,
  workspacesTable,
  workspaceViewsTable,
  insertWorkspaceSchema,
  patchWorkspaceSchema,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// workspaces.org_id is a UUID FK to organizations.id. Use `withOrgContext`
// after resolving the Clerk org id → local UUID so the RLS policies on
// `workspaces` restrict rows to the caller's organisation.

interface RecentViewerDto {
  userId: string
  name: string
  initials: string
  imageUrl: string | null
  openedAt: string
}

interface WorkspaceDto {
  id: string
  name: string
  description: string
  color: string
  pinned: boolean
  tags: string[]
  kind: string
  targetSymbol: string | null
  metadata: Record<string, unknown>
  messageCount: number
  lastMessage: string
  /**
   * Source ids the reviewer last had checked in this workspace's deal-room
   * sidebar. May contain ids whose underlying source has since been deleted
   * — the client filters those out at hydration time.
   */
  selectedSourceIds: string[]
  createdAt: string
  updatedAt: string
  authorUserId: string
  mine: boolean
  /**
   * Most recent teammates (excluding the caller) who opened this workspace
   * within the last 7 days, capped to RECENT_VIEWER_LIMIT and ordered most-
   * recent-first. Empty array when nobody has dropped in yet.
   */
  recentViewers: RecentViewerDto[]
}

function toDto(
  r: typeof workspacesTable.$inferSelect,
  currentUserId: string,
  recentViewers: RecentViewerDto[],
): WorkspaceDto {
  const meta = r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)
    ? (r.metadata as Record<string, unknown>)
    : {}
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    color: r.color,
    pinned: r.pinned,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    kind: r.kind ?? "research",
    targetSymbol: r.targetSymbol ?? null,
    metadata: meta,
    messageCount: r.messageCount,
    lastMessage: r.lastMessage,
    selectedSourceIds: Array.isArray(r.selectedSourceIds)
      ? (r.selectedSourceIds as unknown[]).filter((v): v is string => typeof v === "string")
      : [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    authorUserId: r.authorUserId,
    mine: r.authorUserId === currentUserId,
    recentViewers,
  }
}

/** Avatars per row in the deal-room sidebar — keep small so the rail stays narrow. */
const RECENT_VIEWER_LIMIT = 4
const RECENT_VIEWER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function initialsFromName(name: string, fallback: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  if (parts.length === 1 && parts[0].length > 0) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  // Last resort: derive from a Clerk id like `user_abc123`.
  const stripped = fallback.replace(/^user_/, '').replace(/[^A-Za-z0-9]/g, '')
  return (stripped.slice(0, 2) || '??').toUpperCase()
}

interface ViewerProfile { name: string; imageUrl: string | null }

/**
 * Bulk-fetch display info for a set of Clerk user ids. We hit Clerk's batch
 * `getUserList` endpoint once per request and tolerate failure: the deal-room
 * rail is a non-essential affordance, so a Clerk hiccup falls back to
 * id-derived initials rather than 500'ing the whole workspaces list.
 */
async function fetchViewerProfiles(
  userIds: string[],
): Promise<Map<string, ViewerProfile>> {
  const out = new Map<string, ViewerProfile>()
  if (userIds.length === 0) return out
  try {
    const client = await clerkClient()
    const list = await client.users.getUserList({ userId: userIds, limit: userIds.length })
    for (const u of list.data) {
      const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
      const fallback = u.primaryEmailAddress?.emailAddress
        ?? u.emailAddresses?.[0]?.emailAddress
        ?? 'Teammate'
      out.set(u.id, {
        name: fullName || fallback,
        imageUrl: u.imageUrl ?? null,
      })
    }
  } catch (e) {
    console.warn('[api/workspaces] failed to resolve viewer profiles', e)
  }
  return out
}

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ workspaces: [], synced: false, reason: 'no_workspace' })

  const localOrgId = await resolveLocalOrgId(orgId)

  // Fetch workspaces and the recent-viewer rows in the same RLS-bound
  // transaction so a single org context covers both reads. The viewer query
  // self-excludes the caller — the deal-room sidebar shows "who else", not
  // your own opens.
  const since = new Date(Date.now() - RECENT_VIEWER_WINDOW_MS)
  const { rows, viewerRows } = await withOrgContext(localOrgId, async (tx) => {
    const rows = await tx.select()
      .from(workspacesTable)
      .where(eq(workspacesTable.orgId, localOrgId))
      .orderBy(desc(workspacesTable.pinned), desc(workspacesTable.updatedAt))
      .limit(200)

    const workspaceIds = rows.map(r => r.id)
    if (workspaceIds.length === 0) return { rows, viewerRows: [] as Array<typeof workspaceViewsTable.$inferSelect> }

    const viewerRows = await tx.select()
      .from(workspaceViewsTable)
      .where(and(
        eq(workspaceViewsTable.orgId, localOrgId),
        inArray(workspaceViewsTable.workspaceId, workspaceIds),
        gt(workspaceViewsTable.openedAt, since),
        sql`${workspaceViewsTable.userId} <> ${userId}`,
      ))
      .orderBy(desc(workspaceViewsTable.openedAt))
    return { rows, viewerRows }
  })

  // Group viewer rows by workspace, capped per-workspace, then bulk-resolve
  // distinct user ids against Clerk in one batched call.
  const grouped = new Map<string, Array<typeof workspaceViewsTable.$inferSelect>>()
  for (const v of viewerRows) {
    const arr = grouped.get(v.workspaceId) ?? []
    if (arr.length < RECENT_VIEWER_LIMIT) {
      arr.push(v)
      grouped.set(v.workspaceId, arr)
    }
  }
  const distinctUserIds = Array.from(new Set(viewerRows.map(v => v.userId))).slice(0, 200)
  const profiles = await fetchViewerProfiles(distinctUserIds)

  function viewersFor(workspaceId: string): RecentViewerDto[] {
    const arr = grouped.get(workspaceId) ?? []
    return arr.map(v => {
      const p = profiles.get(v.userId)
      const name = p?.name || 'Teammate'
      return {
        userId: v.userId,
        name,
        initials: initialsFromName(name, v.userId),
        imageUrl: p?.imageUrl ?? null,
        openedAt: v.openedAt.toISOString(),
      }
    })
  }

  return NextResponse.json({
    synced: true,
    currentUserId: userId,
    workspaces: rows.map(r => toDto(r, userId, viewersFor(r.id))),
  })
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = insertWorkspaceSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)
  const inserted = await withOrgContext(localOrgId, (tx) =>
    tx.insert(workspacesTable)
      .values({
        orgId: localOrgId,
        authorUserId: userId,
        name: parsed.data.name,
        description: parsed.data.description ?? '',
        color: parsed.data.color ?? 'var(--accent)',
        pinned: parsed.data.pinned ?? false,
        tags: parsed.data.tags ?? [],
        kind: parsed.data.kind ?? 'research',
        targetSymbol: parsed.data.targetSymbol ?? null,
        metadata: parsed.data.metadata ?? {},
      })
      .returning(),
  )
  return NextResponse.json({ workspace: toDto(inserted[0], userId, []) }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = patchWorkspaceSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)

  // Authorisation rules:
  //   • Owner can patch any field (incl. name/description/tags/pinned).
  //   • For kind='deal' specifically, any teammate in the org can patch the
  //     collaborative subset (metadata, messageCount, lastMessage). This is
  //     what the deal workspace UI uses for cross-surface bookkeeping
  //     (regen memo/deck, mark surfaces stale, blueprint queue updates).
  //   • For all other kinds, only the owner can update anything.
  const COLLAB_FIELDS = new Set(['metadata', 'messageCount', 'lastMessage'])

  const updated = await withOrgContext(localOrgId, async (tx) => {
    const existing = await tx
      .select({ id: workspacesTable.id, kind: workspacesTable.kind, authorUserId: workspacesTable.authorUserId })
      .from(workspacesTable)
      .where(eq(workspacesTable.id, id))
      .limit(1)
    if (existing.length === 0) return []
    const w = existing[0]
    const isOwner = w.authorUserId === userId
    if (!isOwner) {
      if (w.kind !== 'deal') return []
      // Non-owner teammate on a deal workspace: only collaborative fields are
      // allowed. Reject the whole patch if any non-collab field is requested.
      for (const key of Object.keys(parsed.data)) {
        if (!COLLAB_FIELDS.has(key)) return []
      }
    }
    const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() }
    return tx.update(workspacesTable)
      .set(updates)
      .where(eq(workspacesTable.id, id))
      .returning()
  })
  if (!updated.length) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })
  return NextResponse.json({ workspace: toDto(updated[0], userId, []) })
}

export async function DELETE(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)
  const removed = await withOrgContext(localOrgId, (tx) =>
    tx.delete(workspacesTable)
      .where(and(eq(workspacesTable.id, id), eq(workspacesTable.authorUserId, userId)))
      .returning({ id: workspacesTable.id }),
  )
  if (!removed.length) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })
  return NextResponse.json({ ok: true })
}

/**
 * POST /api/workspaces/connectors/sync
 * ────────────────────────────────────
 * Body: { connectionId, workspaceId, folderId?, recursive?: boolean }
 *
 * Triggers a data-room sync into the given workspace. Returns per-file
 * results so the UI can show "imported N, deduped M, skipped K".
 *
 * Security model
 *   - Caller must be authenticated (`auth()`).
 *   - Caller must have an active org; the connection is loaded under that
 *     org's RLS context, so a user from a different org cannot reference
 *     someone else's connection by id.
 *   - The workspace must belong to the caller (`authorUserId`).
 *   - The actual list/download calls go through the user's OAuth token /
 *     API key — see `lib/connectors/data-room/sync.ts` for the per-file
 *     orchestration.
 *
 * Rate limit
 *   We share the existing ingest-route limiter philosophy: cap to 6 syncs
 *   per minute per user, since each sync downloads up to 200 files.
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server"
import { eq, and } from "drizzle-orm"
import {
  db,
  workspacesTable,
  auditLog,
  connectionsTable,
  connectorDefinitionsTable,
  withOrgContext,
} from "@workspace/db"
import { resolveLocalOrgId } from "@/lib/org-resolver"
import { syncDataRoomFolder } from "@/lib/connectors/data-room/sync"

export const runtime = "nodejs"

const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 6
const syncHits = new Map<string, number[]>()

function rateLimited(userId: string): boolean {
  const now = Date.now()
  const arr = (syncHits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (arr.length >= RATE_LIMIT) {
    syncHits.set(userId, arr)
    return true
  }
  arr.push(now)
  syncHits.set(userId, arr)
  return false
}

interface SyncBody {
  connectionId?: string
  workspaceId?: string
  folderId?: string | null
  recursive?: boolean
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: "No active workspace" }, { status: 403 })

  if (rateLimited(userId)) {
    return NextResponse.json(
      { error: "Too Many Requests", message: "Sync rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "retry-after": String(Math.ceil(RATE_WINDOW_MS / 1000)) } },
    )
  }

  let body: SyncBody = {}
  try { body = (await req.json()) as SyncBody } catch { body = {} }
  const connectionId = (body.connectionId || "").trim()
  const workspaceId = (body.workspaceId || "").trim()
  if (!connectionId || !workspaceId) {
    return NextResponse.json({ error: "connectionId and workspaceId are required" }, { status: 400 })
  }

  // Verify the workspace belongs to this user.
  const [ws] = await db
    .select({ id: workspacesTable.id, kind: workspacesTable.kind })
    .from(workspacesTable)
    .where(and(eq(workspacesTable.id, workspaceId), eq(workspacesTable.authorUserId, userId)))
    .limit(1)
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
  }

  const localOrgId = await resolveLocalOrgId(orgId)

  // Resolve the catalog slug from the connection's joined definition row.
  // Done inside org context so RLS guards a cross-org id from leaking.
  const slugRows = await withOrgContext(localOrgId, (tx) =>
    tx
      .select({ slug: connectorDefinitionsTable.slug })
      .from(connectionsTable)
      .innerJoin(
        connectorDefinitionsTable,
        eq(connectionsTable.definitionId, connectorDefinitionsTable.id),
      )
      .where(eq(connectionsTable.id, connectionId))
      .limit(1),
  )
  const slug = slugRows[0]?.slug
  if (!slug) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 })
  }

  const result = await syncDataRoomFolder({
    orgId: localOrgId,
    connectionId,
    connectorSlug: slug,
    workspaceId,
    folderId: body.folderId ?? null,
    userId,
    recursive: body.recursive ?? true,
  })

  await auditLog({
    orgId: localOrgId,
    actorId: userId,
    actorType: "user",
    action: result.ok ? "workspace.connector_sync" : "workspace.connector_sync.failed",
    resourceType: "connection",
    resourceId: connectionId,
    metadata: {
      workspaceId,
      slug,
      folderId: body.folderId ?? null,
      imported: result.imported,
      deduped: result.deduped,
      skipped: result.skipped,
      failed: result.failed,
      walkedFolders: result.walkedFolders,
      fatalError: result.fatalError ?? null,
    },
  })

  return NextResponse.json({
    ok: result.ok,
    slug,
    workspaceId,
    folderId: body.folderId ?? null,
    counts: {
      imported: result.imported,
      deduped: result.deduped,
      skipped: result.skipped,
      failed: result.failed,
      walkedFolders: result.walkedFolders,
    },
    files: result.files,
    fatalError: result.fatalError,
  }, { status: result.ok ? 200 : 400 })
}

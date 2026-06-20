import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server"
import { resolveLocalOrgId } from "@/lib/org-resolver"
import { workspaceBelongsToOrg } from "../../org-guard"
import { getManySources } from "../../store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Fetch a single chunk of a previously ingested source. Backs the chat
 * citation drawer: a click on a `[N]` badge calls this route with the
 * source id + chunk index it received from the chat data part.
 *
 * Tenant isolation is enforced THREE ways before we ever touch storage:
 *  1. The caller must be authenticated.
 *  2. The requested `sourceId` MUST start with `${userId}:` — the same
 *     prefix invariant used by the listing/delete routes. A mismatched
 *     prefix is rejected with 403 even if the row would otherwise exist.
 *  3. Org guard: if the source is associated with a workspace, that
 *     workspace MUST belong to the caller's active Clerk org. This closes
 *     the path where a user who switched orgs (or was removed from an org)
 *     could still read chunks from the previous org's sources by omitting
 *     the `workspaceId` query parameter.
 *
 * Optionally a `workspaceId` may be passed; when supplied we additionally
 * require the row's `workspace_id` to match, so a stale citation from
 * workspace A can't be used to peek into workspace B's content.
 */
export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sourceId = req.nextUrl.searchParams.get("sourceId") || ""
  const chunkIndexRaw = req.nextUrl.searchParams.get("chunkIndex") || ""
  const workspaceId = req.nextUrl.searchParams.get("workspaceId") || null

  if (!sourceId) return NextResponse.json({ error: "sourceId required" }, { status: 400 })
  const chunkIndex = Number.parseInt(chunkIndexRaw, 10)
  if (!Number.isFinite(chunkIndex) || chunkIndex < 0) {
    return NextResponse.json({ error: "chunkIndex required" }, { status: 400 })
  }

  // Re-verify the userId-prefix guard. This is the same invariant the
  // delete endpoint enforces — keep it in sync if the prefix scheme ever
  // changes.
  if (!sourceId.startsWith(`${userId}:`)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const map = await getManySources([sourceId])
  const record = map.get(sourceId)
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 })

  // Org guard: if the source belongs to a workspace, verify that workspace
  // is still accessible under the caller's active org. This prevents a user
  // who switched orgs from reading chunks stored under the previous org.
  if (record.workspaceId) {
    if (!orgId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
    try {
      const localOrgId = await resolveLocalOrgId(orgId)
      const belongs = await workspaceBelongsToOrg(localOrgId, record.workspaceId)
      if (!belongs) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
  }

  // Workspace-match guard: when the caller supplies a workspaceId, also
  // require the stored row to match so a citation from workspace A can't
  // peek into workspace B.
  if (workspaceId && record.workspaceId && record.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  if (chunkIndex >= record.chunks.length) {
    return NextResponse.json({ error: "chunk_out_of_range" }, { status: 404 })
  }

  return NextResponse.json({
    sourceId: record.sourceId,
    sourceName: record.name,
    sourceType: record.type,
    workspaceId: record.workspaceId ?? null,
    chunkIndex,
    chunkText: record.chunks[chunkIndex],
    totalChunks: record.chunks.length,
  })
}

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server"
import { resolveLocalOrgId } from "@/lib/org-resolver"
import { getOrgWorkspaceIds, workspaceBelongsToOrg } from "../org-guard"
import { deleteSource, getManySources, listSourcesForUser, type WorkspaceSourceRecord } from "../store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface SourceDto {
  /** Id with the user prefix stripped — clients never see other users' ids. */
  id: string
  /** Full namespaced id, used as the key when sending to chat / studio. */
  sourceId: string
  name: string
  type: string
  workspaceId: string | null
  byteSize: number | null
  hash: string | null
  origin: string | null
  connectorSlug: string | null
  ingestedAt: string | null
  chunkCount: number
}

function toDto(userId: string, r: WorkspaceSourceRecord): SourceDto {
  const prefix = `${userId}:`
  return {
    id: r.sourceId.startsWith(prefix) ? r.sourceId.slice(prefix.length) : r.sourceId,
    sourceId: r.sourceId,
    name: r.name,
    type: r.type,
    workspaceId: r.workspaceId ?? null,
    byteSize: r.byteSize ?? null,
    hash: r.hash ?? null,
    origin: r.origin ?? null,
    connectorSlug: r.connectorSlug ?? null,
    ingestedAt: r.ingestedAt ?? null,
    chunkCount: r.chunks.length,
  }
}

/**
 * List the caller's sources, optionally filtered to a single workspace
 * (?workspaceId=…).
 *
 * Tenant isolation is enforced in two layers:
 *  1. User-prefix guard: `listSourcesForUser` only returns rows whose
 *     `source_id` starts with `${userId}:`.
 *  2. Org guard: results are further filtered to sources whose `workspaceId`
 *     belongs to the caller's active Clerk org (verified via RLS-protected
 *     `workspacesTable`). Sources with no workspaceId are excluded from the
 *     org-filtered list when a workspaceId filter is active; when no filter
 *     is requested they are included only if they are unscoped (null).
 *
 * A `workspaceId` belonging to another org can never widen results — the RLS
 * query will return no matching workspace rows, so `orgWorkspaceIds` will not
 * contain it and the source will be dropped.
 */
export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const workspaceId = req.nextUrl.searchParams.get("workspaceId")

  const all = await listSourcesForUser(userId)

  // Resolve which workspaces belong to the caller's active org so we can
  // exclude sources from any org the caller is no longer a member of.
  let orgWorkspaceIds: Set<string> = new Set()
  if (orgId) {
    try {
      const localOrgId = await resolveLocalOrgId(orgId)
      orgWorkspaceIds = await getOrgWorkspaceIds(localOrgId)
    } catch {
      // If org resolution fails, fall through with an empty set — the
      // workspace filter below will exclude all workspace-scoped sources
      // safely rather than returning data from a stale org.
    }
  }

  // Keep a source iff:
  //   • it has no workspace association (unscoped / legacy research sources), OR
  //   • its workspaceId is in the caller's current org
  const orgFiltered = all.filter(
    (r) => r.workspaceId === null || r.workspaceId === undefined || orgWorkspaceIds.has(r.workspaceId),
  )

  const filtered = workspaceId
    ? orgFiltered.filter((r) => r.workspaceId === workspaceId)
    : orgFiltered

  return NextResponse.json({ sources: filtered.map((r) => toDto(userId, r)) })
}

/**
 * Delete a single source. Accepts either the bare id (we re-prefix with
 * the caller's userId) or the full `userId:…` form (we cross-check the
 * prefix). Cross-tenant and cross-org deletes are rejected before touching
 * storage.
 */
export async function DELETE(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const idParam = req.nextUrl.searchParams.get("id")
  if (!idParam) return NextResponse.json({ error: "id required" }, { status: 400 })

  const namespaced = idParam.startsWith(`${userId}:`) ? idParam : `${userId}:${idParam}`

  // Fetch the source first so we can verify its workspace belongs to the
  // caller's active org — the userId-prefix check only prevents cross-user
  // deletes; without this org check a user who switched orgs (or was removed
  // from their previous org) could still delete the old org's source rows.
  const sourceMap = await getManySources([namespaced])
  const source = sourceMap.get(namespaced)

  if (source?.workspaceId) {
    if (!orgId) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 })
    }
    try {
      const localOrgId = await resolveLocalOrgId(orgId)
      const belongs = await workspaceBelongsToOrg(localOrgId, source.workspaceId)
      if (!belongs) {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 })
    }
  }

  const result = await deleteSource(userId, namespaced)
  if (!result.ok) {
    const status = result.reason === "forbidden" ? 403 : 500
    return NextResponse.json({ ok: false, error: result.reason ?? "delete_failed" }, { status })
  }
  return NextResponse.json({ ok: true })
}

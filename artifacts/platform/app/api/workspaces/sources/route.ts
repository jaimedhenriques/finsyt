import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server"
import { deleteSource, listSourcesForUser, type WorkspaceSourceRecord } from "../store"

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
 * (?workspaceId=…). The workspace filter is applied AFTER the user-prefix
 * filter so a workspaceId belonging to another user can never widen
 * results — it just returns an empty array.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const workspaceId = req.nextUrl.searchParams.get("workspaceId")
  const all = await listSourcesForUser(userId)
  const filtered = workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all
  return NextResponse.json({ sources: filtered.map((r) => toDto(userId, r)) })
}

/**
 * Delete a single source. Accepts either the bare id (we re-prefix with
 * the caller's userId) or the full `userId:…` form (we cross-check the
 * prefix). Cross-tenant deletes are rejected before touching storage.
 */
export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const idParam = req.nextUrl.searchParams.get("id")
  if (!idParam) return NextResponse.json({ error: "id required" }, { status: 400 })

  const namespaced = idParam.startsWith(`${userId}:`) ? idParam : `${userId}:${idParam}`
  const result = await deleteSource(userId, namespaced)
  if (!result.ok) {
    const status = result.reason === "forbidden" ? 403 : 500
    return NextResponse.json({ ok: false, error: result.reason ?? "delete_failed" }, { status })
  }
  return NextResponse.json({ ok: true })
}

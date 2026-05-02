/**
 * GET /api/workspaces/connectors/folders?connectionId=…&folderId=…
 * ───────────────────────────────────────────────────────────────
 * Lists the children of a folder under a data-room connection so the picker
 * UI can drill in. The list is rendered straight from the provider — we do
 * NOT cache anything server-side, both because folder layouts change often
 * during diligence and because the call already runs under the user's own
 * OAuth token (caching would defeat the per-user permission story).
 *
 * Response shape:
 *   { ok: true, entries: DataRoomEntry[], folderId: string }
 *
 * On a missing folderId we use the adapter's `defaultRootFolderId`. When a
 * provider needs an extra credential value (e.g. SecureDocs requires a
 * data-room id), the adapter returns it via `rootFolderHint` and we surface
 * a 400 with an explanatory message.
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server"
import { resolveLocalOrgId } from "@/lib/org-resolver"
import { eq } from "drizzle-orm"
import {
  connectionsTable,
  connectorDefinitionsTable,
  withOrgContext,
} from "@workspace/db"
import { loadConnection } from "@/lib/connectors/accessor"
import { getDataRoomAdapter } from "@/lib/connectors/data-room/providers"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: "No active workspace" }, { status: 403 })

  const url = new URL(req.url)
  const connectionId = url.searchParams.get("connectionId") || ""
  const folderId = url.searchParams.get("folderId") || ""
  if (!connectionId) {
    return NextResponse.json({ error: "connectionId required" }, { status: 400 })
  }

  const localOrgId = await resolveLocalOrgId(orgId)

  // Look up the catalog slug from the connection's definition row. We can't
  // get it directly off `connectionsTable`.
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
  const adapter = getDataRoomAdapter(slug)
  if (!adapter) {
    return NextResponse.json({ error: `Connector '${slug}' is not a data-room provider` }, { status: 400 })
  }

  const loaded = await loadConnection(localOrgId, connectionId, {
    withCredentials: true,
    actorId: userId,
  })
  if (!loaded) return NextResponse.json({ error: "Connection not found" }, { status: 404 })
  if (loaded.connection.status === "disabled") {
    return NextResponse.json({ error: "Connection is disabled" }, { status: 400 })
  }
  const creds = loaded.credentials || {}

  const startFolder = folderId || adapter.defaultRootFolderId(creds)
  const hint = adapter.rootFolderHint(creds)
  if (!hint.ok && !folderId) {
    return NextResponse.json({ error: hint.message ?? "Provider requires a folder id" }, { status: 400 })
  }

  try {
    const entries = await adapter.listFolder(creds, startFolder)
    return NextResponse.json({ ok: true, slug, folderId: startFolder, entries })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message || "list_failed" },
      { status: 502 },
    )
  }
}

/**
 * GET /api/workspaces/connectors/connections
 * ──────────────────────────────────────────
 * Returns the caller's data-room-eligible connections so the workspace UI
 * can render the picker. We filter to:
 *
 *   - connections in the active org (RLS via `withOrgContext`)
 *   - connections whose linked catalog slug is one of the data-room providers
 *     we have an adapter for (Box, Dropbox, Datasite, Intralinks, SecureDocs)
 *   - status === "active" (draft / disabled connections cannot sync)
 *
 * No credentials are returned. The picker only needs the id / display name /
 * slug to call `/api/workspaces/connectors/folders` and `…/sync`.
 */
import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth-server"
import {
  connectionsTable,
  connectorDefinitionsTable,
  withOrgContext,
} from "@workspace/db"
import { resolveLocalOrgId } from "@/lib/org-resolver"
import { listDataRoomSlugs } from "@/lib/connectors/data-room/providers"

export const runtime = "nodejs"

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: "No active workspace" }, { status: 403 })

  const localOrgId = await resolveLocalOrgId(orgId)
  const dataRoomSlugs = listDataRoomSlugs()

  const rows = await withOrgContext(localOrgId, (tx) =>
    tx
      .select({
        id: connectionsTable.id,
        displayName: connectionsTable.displayName,
        status: connectionsTable.status,
        category: connectionsTable.category,
        authType: connectionsTable.authType,
        slug: connectorDefinitionsTable.slug,
        lastTestOk: connectionsTable.lastTestOk,
        lastTestAt: connectionsTable.lastTestAt,
      })
      .from(connectionsTable)
      .innerJoin(
        connectorDefinitionsTable,
        eq(connectionsTable.definitionId, connectorDefinitionsTable.id),
      )
      .where(eq(connectionsTable.orgId, localOrgId)),
  )

  const connections = rows
    .filter((r) => dataRoomSlugs.includes(r.slug as (typeof dataRoomSlugs)[number]))
    .filter((r) => r.status === "active")
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      displayName: r.displayName,
      status: r.status,
      authType: r.authType,
      lastTestOk: r.lastTestOk,
      lastTestAt: r.lastTestAt,
    }))

  return NextResponse.json({ connections })
}

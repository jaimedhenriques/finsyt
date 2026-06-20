/**
 * Org-level workspace ownership guards for the workspace-sources surface.
 *
 * `workspace_sources` rows live in Supabase and are keyed only by userId
 * prefix. The corresponding `workspaces` rows live in Postgres under full RLS.
 * These helpers bridge the gap: they query the RLS-protected `workspacesTable`
 * to verify that a given workspace UUID actually belongs to the caller's active
 * Clerk org before any source read/write is allowed.
 */
import { withOrgContext, workspacesTable } from "@workspace/db"
import { eq } from "drizzle-orm"

/**
 * Return the set of workspace UUIDs that belong to `localOrgId`.
 * Uses `withOrgContext` so RLS enforces the org boundary — a misconfigured
 * caller cannot widen the set by supplying a different org id.
 */
export async function getOrgWorkspaceIds(localOrgId: string): Promise<Set<string>> {
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx
      .select({ id: workspacesTable.id })
      .from(workspacesTable)
      .where(eq(workspacesTable.orgId, localOrgId))
      .limit(1000),
  )
  return new Set(rows.map((r) => r.id))
}

/**
 * Return true iff `workspaceId` belongs to `localOrgId`.
 * The RLS context ensures only rows whose `org_id = localOrgId` are visible,
 * so a positive result is a proof of membership.
 */
export async function workspaceBelongsToOrg(
  localOrgId: string,
  workspaceId: string,
): Promise<boolean> {
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx
      .select({ id: workspacesTable.id })
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId))
      .limit(1),
  )
  return rows.length > 0
}

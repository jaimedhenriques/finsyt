import { pool } from "./index";

/**
 * Idempotent bootstrap for the `workspace_views` table.
 *
 * Mirrors `ensureBlueprintSchema` / `ensureDeckOverridesSchema` — we create
 * the physical table with raw SQL on every server boot so a fresh database
 * self-heals without the developer having to run `drizzle-kit push`
 * interactively. The drizzle definition in `./schema/workspaces.ts` remains
 * the source of truth for application queries; this function only guarantees
 * the matching table/index shapes exist in Postgres.
 *
 * RLS for this table is applied by `bootstrapRls()` (via `rls-sql.ts`)
 * inside an `IF EXISTS` guard, so this bootstrap MUST run before
 * `bootstrapRls()` or the tenant-isolation policy silently won't attach.
 */
export async function ensureWorkspaceViewsSchema(): Promise<void> {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_views (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id text NOT NULL,
      opened_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS workspace_views_workspace_user_uniq
       ON workspace_views (workspace_id, user_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS workspace_views_org_workspace_opened_idx
       ON workspace_views (org_id, workspace_id, opened_at)`,
  );
}

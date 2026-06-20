import { pool } from "./index";

/**
 * Idempotent bootstrap for the `reports` / `report_blocks` tables.
 *
 * Mirrors `ensureDeckOverridesSchema` — we create the physical tables with raw
 * SQL on every server boot so a fresh database self-heals without the developer
 * having to run `drizzle-kit push` interactively. The drizzle definitions in
 * `./schema/reports.ts` remain the source of truth for application queries;
 * this function only guarantees the matching table/index shapes exist.
 *
 * The RLS policies for these tables are applied separately by `bootstrapRls`
 * (see `rls-sql.ts`), guarded by `IF EXISTS` checks — so calling this function
 * before `bootstrapRls()` ensures the policies actually attach on first boot.
 */
export async function ensureReportsSchema(): Promise<void> {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id text NOT NULL,
      author_user_id text NOT NULL,
      title text NOT NULL,
      subtitle text NOT NULL DEFAULT '',
      symbol text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS reports_org_idx ON reports (org_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS reports_org_updated_idx ON reports (org_id, updated_at)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_blocks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      org_id text NOT NULL,
      kind text NOT NULL,
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      position integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS report_blocks_report_idx ON report_blocks (report_id, position)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS report_blocks_org_idx ON report_blocks (org_id)`);
}

import { pool } from "./index";

/**
 * Idempotent bootstrap for the `deck_overrides` table.
 *
 * Mirrors `ensureBlueprintSchema` — we create the physical table with raw
 * SQL on every server boot so a fresh database self-heals without the
 * developer having to run `drizzle-kit push` interactively. The drizzle
 * definition in `./schema/deck-overrides.ts` remains the source of truth
 * for application queries; this function only guarantees the matching
 * table/index shapes exist in Postgres.
 *
 * The RLS policies for this table are applied separately by `bootstrapRls`
 * (see `rls-sql.ts`), guarded by an `IF EXISTS` check — so calling this
 * function before `bootstrapRls()` ensures the policies actually attach.
 */
export async function ensureDeckOverridesSchema(): Promise<void> {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS deck_overrides (
      org_id text PRIMARY KEY,
      peer_set_id uuid,
      wacc real,
      terminal_growth real,
      growth_stage1 real,
      growth_stage2 real,
      updated_by_user_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

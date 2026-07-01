import { pool } from "./index";

/**
 * Idempotent bootstrap for the `house_style` table.
 *
 * Mirrors `ensureDeckOverridesSchema` — we create the physical table with raw
 * SQL on every server boot so a fresh database self-heals without the
 * developer having to run `drizzle-kit push` interactively. The drizzle
 * definition in `./schema/house-style.ts` remains the source of truth for
 * application queries; this function only guarantees the matching table shape
 * exists in Postgres.
 *
 * The RLS policy for this table is applied separately by `bootstrapRls`
 * (see `rls-sql.ts`), guarded by an `IF EXISTS` check — so calling this
 * function before `bootstrapRls()` ensures the policy actually attaches.
 */
export async function ensureHouseStyleSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS house_style (
      org_id text PRIMARY KEY,
      enabled boolean NOT NULL DEFAULT true,
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_by_user_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

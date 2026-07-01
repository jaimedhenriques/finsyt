import { pool } from "./index";

/**
 * Idempotent CREATE TABLE IF NOT EXISTS bootstrap for the private company
 * tables: `private_financials` and `private_cap_table`.
 *
 * Called from the Next.js instrumentation hook (before bootstrapRls) so the
 * tables exist when RLS policies are applied. Safe to call on every server
 * start.
 */
export async function ensurePrivateCompanySchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS private_financials (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        coresignal_id TEXT NOT NULL,
        company_name  TEXT NOT NULL DEFAULT '',
        statement     TEXT NOT NULL,
        period_type   TEXT NOT NULL DEFAULT 'annual',
        period        TEXT NOT NULL,
        source        TEXT NOT NULL DEFAULT 'manual',
        source_label  TEXT,
        currency      TEXT NOT NULL DEFAULT 'USD',
        data          JSONB NOT NULL DEFAULT '{}',
        notes         TEXT NOT NULL DEFAULT '',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS private_financials_uniq_period
        ON private_financials (org_id, coresignal_id, statement, period, period_type);

      CREATE INDEX IF NOT EXISTS private_financials_org_idx
        ON private_financials (org_id);

      CREATE INDEX IF NOT EXISTS private_financials_org_company_idx
        ON private_financials (org_id, coresignal_id);

      CREATE TABLE IF NOT EXISTS private_cap_table (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        coresignal_id   TEXT NOT NULL,
        company_name    TEXT NOT NULL DEFAULT '',
        entry_type      TEXT NOT NULL DEFAULT 'shareholder',
        name            TEXT NOT NULL,
        share_class     TEXT,
        round           TEXT,
        shares          NUMERIC(20, 0),
        ownership_pct   NUMERIC(8, 4),
        liquidation_pref NUMERIC(6, 2),
        board_seat      TEXT,
        position        INTEGER NOT NULL DEFAULT 0,
        data            JSONB NOT NULL DEFAULT '{}',
        notes           TEXT NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS private_cap_table_org_idx
        ON private_cap_table (org_id);

      CREATE INDEX IF NOT EXISTS private_cap_table_org_company_idx
        ON private_cap_table (org_id, coresignal_id);
    `);
  } finally {
    client.release();
  }
}

import { pool } from "./index";

/**
 * Idempotent bootstrap for the visual workflow editor tables.
 *
 * Why not `drizzle-kit push`?
 *   The repo runs `drizzle-kit push` interactively, and pushing the full
 *   schema triggers a (false-positive) rename prompt for the partitioned
 *   `audit_events` table. Bootstrapping via raw SQL — the same pattern
 *   `ensureBlueprintSchema()` uses — sidesteps that and lets us evolve this
 *   schema without touching unrelated migration prompts.
 *
 * The drizzle table definitions in `./schema/workflows.ts` remain the source
 * of truth for queries; this function just guarantees the physical
 * tables/indexes exist with shapes that match those definitions.
 *
 * Must run BEFORE `bootstrapRls()` so the tenant-isolation policy DO blocks
 * (which guard on `IF EXISTS`) attach on first boot.
 */
export async function ensureWorkflowsSchema(): Promise<void> {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflows (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id text NOT NULL,
      author_user_id text NOT NULL,
      name text NOT NULL,
      description text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'Draft',
      graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
      schedule jsonb,
      last_run_at timestamptz,
      next_run_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS workflows_org_idx ON workflows (org_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS workflows_org_status_idx ON workflows (org_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS workflows_next_run_idx ON workflows (next_run_at)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id text NOT NULL,
      workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      workflow_name text NOT NULL,
      triggered_by text NOT NULL DEFAULT 'manual',
      triggered_by_user_id text,
      run_status text NOT NULL DEFAULT 'running',
      node_results jsonb NOT NULL DEFAULT '[]'::jsonb,
      error_message text,
      latency_ms integer,
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS workflow_runs_org_idx ON workflow_runs (org_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS workflow_runs_org_workflow_idx ON workflow_runs (org_id, workflow_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS workflow_runs_org_started_idx ON workflow_runs (org_id, started_at)`);
}

import { pool } from "./index";

/**
 * Idempotent bootstrap for the Blueprint / Playbook tables.
 *
 * Why not `drizzle-kit push`?
 *   The repo runs `drizzle-kit push` interactively, and pushing this schema
 *   triggers a (false-positive) rename prompt for the partitioned
 *   `audit_events` table. Bootstrapping via raw SQL — exactly the pattern
 *   `ensureAuditSchema()` uses — sidesteps that and lets us evolve this
 *   schema without touching unrelated migration prompts.
 *
 * The drizzle table definitions in `./schema/blueprints.ts` remain the
 * source of truth for queries; this function just guarantees the physical
 * tables/indexes exist with shapes that match those definitions.
 */
export async function ensureBlueprintSchema(): Promise<void> {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blueprints (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id text NOT NULL,
      author_user_id text NOT NULL,
      slug text NOT NULL,
      name text NOT NULL,
      description text NOT NULL DEFAULT '',
      category text NOT NULL,
      icon text NOT NULL DEFAULT '◎',
      visibility text NOT NULL DEFAULT 'private',
      version integer NOT NULL DEFAULT 1,
      parameters jsonb NOT NULL DEFAULT '[]'::jsonb,
      steps jsonb NOT NULL DEFAULT '[]'::jsonb,
      expected_outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
      required_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
      required_connectors jsonb NOT NULL DEFAULT '[]'::jsonb,
      published_slug text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS blueprints_org_idx ON blueprints (org_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS blueprints_org_visibility_idx ON blueprints (org_id, visibility)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS blueprints_published_slug_idx ON blueprints (published_slug)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blueprint_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id text NOT NULL,
      blueprint_id uuid NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
      version integer NOT NULL,
      payload jsonb NOT NULL,
      author_user_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS blueprint_versions_org_blueprint_idx ON blueprint_versions (org_id, blueprint_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS blueprint_versions_blueprint_version_idx ON blueprint_versions (blueprint_id, version)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blueprint_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id text NOT NULL,
      blueprint_id uuid NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
      blueprint_version integer NOT NULL,
      blueprint_name text NOT NULL,
      blueprint_category text NOT NULL,
      blueprint_icon text NOT NULL DEFAULT '◎',
      triggered_by text NOT NULL DEFAULT 'manual',
      triggered_by_user_id text,
      parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
      target jsonb,
      run_status text NOT NULL DEFAULT 'running',
      step_results jsonb NOT NULL DEFAULT '[]'::jsonb,
      final_output jsonb,
      sources jsonb NOT NULL DEFAULT '[]'::jsonb,
      error_message text,
      prompt_tokens integer,
      completion_tokens integer,
      latency_ms integer,
      pinned_note_id uuid,
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS blueprint_runs_org_idx ON blueprint_runs (org_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS blueprint_runs_org_blueprint_idx ON blueprint_runs (org_id, blueprint_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS blueprint_runs_org_started_idx ON blueprint_runs (org_id, started_at)`);
}

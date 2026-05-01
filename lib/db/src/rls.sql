-- Row-level security policies for tenant isolation.
--
-- Every protected query MUST be issued from a connection that has set
--   SELECT set_config('app.current_org_id', '<uuid>', true);
-- (see `withOrgContext` in lib/db/src/index.ts). When the setting is missing
-- or does not match the row's org_id, all SELECT/INSERT/UPDATE/DELETE
-- operations are blocked at the database layer — even for the table owner —
-- thanks to FORCE ROW LEVEL SECURITY.
--
-- IMPORTANT: superusers and roles with BYPASSRLS ignore RLS unconditionally.
-- We therefore create a low-privilege `app_runtime` role and `withOrgContext`
-- does `SET LOCAL ROLE app_runtime` before issuing any user query when the
-- DB_RUNTIME_ROLE env var is set. DB_RUNTIME_ROLE MUST be set whenever the
-- connection role is a superuser or has BYPASSRLS — otherwise all policies
-- below are silently bypassed and tenant isolation is broken. Call
-- `assertRlsSafe()` from lib/db/src/index.ts at server startup to enforce
-- this invariant and detect misconfigured deployments early.
--
-- Idempotent: safe to run on every deploy.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END$$;

GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['leads', 'research_notes', 'chat_messages', 'memberships', 'portfolio_positions', 'api_keys'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I '
      'USING (org_id::text = current_setting(''app.current_org_id'', true)) '
      'WITH CHECK (org_id::text = current_setting(''app.current_org_id'', true))',
      t, t
    );
  END LOOP;
END$$;

-- Organizations are tenant-owned to themselves.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organizations_self_visible ON organizations;
CREATE POLICY organizations_self_visible ON organizations
  USING (id::text = current_setting('app.current_org_id', true))
  WITH CHECK (id::text = current_setting('app.current_org_id', true));

-- The bootstrap path (creating new orgs, signup) needs to be able to insert
-- organizations regardless of the current_org_id setting. That code MUST run
-- as a privileged role outside of `withOrgContext`.

-- Seed the SYSTEM org used by anonymous public endpoints (e.g. marketing
-- lead capture). Idempotent.
INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000000', 'System', 'system')
ON CONFLICT (id) DO NOTHING;

-- ── Clerk-id-keyed tables ───────────────────────────────────────────────────
-- Tables that store Clerk org/user ids as text (because Clerk owns the
-- identity source of truth) cannot use the UUID-based `app.current_org_id`
-- channel above. They use a parallel pair of GUCs instead, set inside
-- `withClerkContext` (see lib/db/src/index.ts):
--   SELECT set_config('app.current_clerk_org_id',  '<org_…>', true);
--   SELECT set_config('app.current_clerk_user_id', '<user_…>', true);
-- Defense-in-depth: every query is also app-level filtered, but RLS guarantees
-- that even a forgotten WHERE clause cannot leak rows across tenants.

ALTER TABLE screener_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE screener_presets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS screener_presets_select ON screener_presets;
CREATE POLICY screener_presets_select ON screener_presets
  FOR SELECT
  USING (
    org_id = current_setting('app.current_clerk_org_id', true)
    AND (
      author_user_id = current_setting('app.current_clerk_user_id', true)
      OR shared = true
    )
  );

DROP POLICY IF EXISTS screener_presets_insert ON screener_presets;
CREATE POLICY screener_presets_insert ON screener_presets
  FOR INSERT
  WITH CHECK (
    org_id = current_setting('app.current_clerk_org_id', true)
    AND author_user_id = current_setting('app.current_clerk_user_id', true)
  );

DROP POLICY IF EXISTS screener_presets_update ON screener_presets;
CREATE POLICY screener_presets_update ON screener_presets
  FOR UPDATE
  USING (
    org_id = current_setting('app.current_clerk_org_id', true)
    AND author_user_id = current_setting('app.current_clerk_user_id', true)
  )
  WITH CHECK (
    org_id = current_setting('app.current_clerk_org_id', true)
    AND author_user_id = current_setting('app.current_clerk_user_id', true)
  );

DROP POLICY IF EXISTS screener_presets_delete ON screener_presets;
CREATE POLICY screener_presets_delete ON screener_presets
  FOR DELETE
  USING (
    org_id = current_setting('app.current_clerk_org_id', true)
    AND author_user_id = current_setting('app.current_clerk_user_id', true)
  );

-- ── Agentic AI Workspace ────────────────────────────────────────────────────
-- `agents` and `agent_runs` are workspace-shared (any teammate in the org can
-- see and run their colleagues' agents — this is the team-research use case).
-- Every read/write must enter `withClerkContext(orgId, userId, …)` so the
-- `app.current_clerk_org_id` GUC is bound; otherwise these policies block all
-- access, which is exactly the fail-closed behaviour we want.

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agents_select ON agents;
CREATE POLICY agents_select ON agents
  FOR SELECT
  USING (org_id = current_setting('app.current_clerk_org_id', true));

DROP POLICY IF EXISTS agents_insert ON agents;
CREATE POLICY agents_insert ON agents
  FOR INSERT
  WITH CHECK (
    org_id = current_setting('app.current_clerk_org_id', true)
    AND author_user_id = current_setting('app.current_clerk_user_id', true)
  );

DROP POLICY IF EXISTS agents_update ON agents;
CREATE POLICY agents_update ON agents
  FOR UPDATE
  USING (org_id = current_setting('app.current_clerk_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_clerk_org_id', true));

DROP POLICY IF EXISTS agents_delete ON agents;
CREATE POLICY agents_delete ON agents
  FOR DELETE
  USING (org_id = current_setting('app.current_clerk_org_id', true));

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_runs_select ON agent_runs;
CREATE POLICY agent_runs_select ON agent_runs
  FOR SELECT
  USING (org_id = current_setting('app.current_clerk_org_id', true));

DROP POLICY IF EXISTS agent_runs_insert ON agent_runs;
CREATE POLICY agent_runs_insert ON agent_runs
  FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_clerk_org_id', true));

DROP POLICY IF EXISTS agent_runs_update ON agent_runs;
CREATE POLICY agent_runs_update ON agent_runs
  FOR UPDATE
  USING (org_id = current_setting('app.current_clerk_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_clerk_org_id', true));

DROP POLICY IF EXISTS agent_runs_delete ON agent_runs;
CREATE POLICY agent_runs_delete ON agent_runs
  FOR DELETE
  USING (org_id = current_setting('app.current_clerk_org_id', true));

-- ── Compliance tables ───────────────────────────────────────────────────────
-- audit_events / org_retention_settings / account_deletion_requests /
-- data_export_requests are owned by `ensureAuditSchema()` in
-- `lib/db/src/audit.ts` (which creates the tables and installs the policies
-- below idempotently on every server boot). They key on text Clerk-style
-- org ids, so they reuse the `app.current_clerk_org_id` GUC channel set by
-- `withComplianceContext()`.
--
-- Mirrored here for documentation / human review only — `bootstrapRls()` does
-- NOT create these tables, so the policies must be installed by
-- `ensureAuditSchema()` after the tables exist.
--
-- DO $$
-- DECLARE
--   t text;
--   tables text[] := ARRAY[
--     'audit_events', 'org_retention_settings',
--     'account_deletion_requests', 'data_export_requests'
--   ];
-- BEGIN
--   FOREACH t IN ARRAY tables LOOP
--     EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
--     EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
--     EXECUTE format(
--       'CREATE POLICY %I_tenant_isolation ON %I '
--       'USING (org_id = current_setting(''app.current_clerk_org_id'', true)) '
--       'WITH CHECK (org_id = current_setting(''app.current_clerk_org_id'', true))',
--       t, t
--     );
--   END LOOP;
-- END$$;

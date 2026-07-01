/**
 * Row-level security policies for tenant isolation, inlined as a TypeScript
 * constant so the SQL ships inside the bundled api-server output (esbuild
 * does not copy `.sql` files into `dist/`). The Next.js platform also
 * imports this directly via `bootstrapRls()` to self-heal a fresh database.
 *
 * Keep this in sync with any future schema-level RLS changes. The whole
 * block is wrapped in a single transaction by `bootstrapRls()` and is
 * idempotent — safe to re-run on every server boot.
 */
export const RLS_SQL = String.raw`
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

-- Grant the connection role membership in app_runtime so that
-- SET LOCAL ROLE app_runtime (issued inside withOrgContext / withClerkContext)
-- is permitted. Without this, deployments whose connection role has BYPASSRLS
-- (e.g. Neon's neondb_owner) fail with "permission denied to set role app_runtime"
-- on every tenant query. Idempotent: skipped when the grant already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_auth_members m
      JOIN pg_roles r ON r.oid = m.roleid
      JOIN pg_roles u ON u.oid = m.member
     WHERE r.rolname = 'app_runtime'
       AND u.rolname = current_user
  ) THEN
    EXECUTE format('GRANT app_runtime TO %I', current_user);
  END IF;
END$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['leads', 'research_notes', 'chat_messages', 'memberships', 'portfolio_positions', 'api_keys', 'alerts', 'workspaces', 'workspace_views', 'matrices', 'matrix_snapshots', 'dashboard_layouts', 'org_subscriptions', 'usage_counters', 'private_financials', 'private_cap_table'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON %I', t, t);
      EXECUTE format(
        'CREATE POLICY %I_tenant_isolation ON %I '
        'USING (org_id::text = current_setting(''app.current_org_id'', true)) '
        'WITH CHECK (org_id::text = current_setting(''app.current_org_id'', true))',
        t, t
      );
    END IF;
  END LOOP;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organizations') THEN
    ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS organizations_self_visible ON organizations;
    CREATE POLICY organizations_self_visible ON organizations
      USING (id::text = current_setting('app.current_org_id', true))
      WITH CHECK (id::text = current_setting('app.current_org_id', true));

    INSERT INTO organizations (id, name, slug)
    VALUES ('00000000-0000-0000-0000-000000000000', 'System', 'system')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'screener_presets') THEN
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
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agents') THEN
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
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'peer_sets') THEN
    ALTER TABLE peer_sets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE peer_sets FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS peer_sets_select ON peer_sets;
    CREATE POLICY peer_sets_select ON peer_sets
      FOR SELECT
      USING (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS peer_sets_insert ON peer_sets;
    CREATE POLICY peer_sets_insert ON peer_sets
      FOR INSERT
      WITH CHECK (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND author_user_id = current_setting('app.current_clerk_user_id', true)
      );

    DROP POLICY IF EXISTS peer_sets_update ON peer_sets;
    CREATE POLICY peer_sets_update ON peer_sets
      FOR UPDATE
      USING (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND author_user_id = current_setting('app.current_clerk_user_id', true)
      )
      WITH CHECK (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND author_user_id = current_setting('app.current_clerk_user_id', true)
      );

    DROP POLICY IF EXISTS peer_sets_delete ON peer_sets;
    CREATE POLICY peer_sets_delete ON peer_sets
      FOR DELETE
      USING (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND author_user_id = current_setting('app.current_clerk_user_id', true)
      );
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'peer_set_members') THEN
    ALTER TABLE peer_set_members ENABLE ROW LEVEL SECURITY;
    ALTER TABLE peer_set_members FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS peer_set_members_select ON peer_set_members;
    CREATE POLICY peer_set_members_select ON peer_set_members
      FOR SELECT
      USING (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS peer_set_members_insert ON peer_set_members;
    CREATE POLICY peer_set_members_insert ON peer_set_members
      FOR INSERT
      WITH CHECK (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS peer_set_members_update ON peer_set_members;
    CREATE POLICY peer_set_members_update ON peer_set_members
      FOR UPDATE
      USING (org_id = current_setting('app.current_clerk_org_id', true))
      WITH CHECK (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS peer_set_members_delete ON peer_set_members;
    CREATE POLICY peer_set_members_delete ON peer_set_members
      FOR DELETE
      USING (org_id = current_setting('app.current_clerk_org_id', true));

    -- Defence-in-depth: ensure peer_set_members.set_id has an explicit FK to
    -- peer_sets(id) ON DELETE CASCADE. The schema-level reference is the
    -- canonical source of truth for new installs; this idempotent ALTER
    -- ensures any pre-existing database picks up the cascade so deleting a
    -- peer set never orphans member rows even if the route's transaction is
    -- bypassed (e.g. direct SQL or a future endpoint).
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'peer_set_members'
        AND constraint_name = 'peer_set_members_set_id_peer_sets_id_fk'
    ) THEN
      ALTER TABLE peer_set_members
        ADD CONSTRAINT peer_set_members_set_id_peer_sets_id_fk
        FOREIGN KEY (set_id) REFERENCES peer_sets(id) ON DELETE CASCADE;
    END IF;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reports') THEN
    ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
    ALTER TABLE reports FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS reports_select ON reports;
    CREATE POLICY reports_select ON reports
      FOR SELECT
      USING (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS reports_insert ON reports;
    CREATE POLICY reports_insert ON reports
      FOR INSERT
      WITH CHECK (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND author_user_id = current_setting('app.current_clerk_user_id', true)
      );

    DROP POLICY IF EXISTS reports_update ON reports;
    CREATE POLICY reports_update ON reports
      FOR UPDATE
      USING (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND author_user_id = current_setting('app.current_clerk_user_id', true)
      )
      WITH CHECK (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND author_user_id = current_setting('app.current_clerk_user_id', true)
      );

    DROP POLICY IF EXISTS reports_delete ON reports;
    CREATE POLICY reports_delete ON reports
      FOR DELETE
      USING (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND author_user_id = current_setting('app.current_clerk_user_id', true)
      );
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'report_blocks') THEN
    ALTER TABLE report_blocks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE report_blocks FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS report_blocks_select ON report_blocks;
    CREATE POLICY report_blocks_select ON report_blocks
      FOR SELECT
      USING (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS report_blocks_insert ON report_blocks;
    CREATE POLICY report_blocks_insert ON report_blocks
      FOR INSERT
      WITH CHECK (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS report_blocks_update ON report_blocks;
    CREATE POLICY report_blocks_update ON report_blocks
      FOR UPDATE
      USING (org_id = current_setting('app.current_clerk_org_id', true))
      WITH CHECK (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS report_blocks_delete ON report_blocks;
    CREATE POLICY report_blocks_delete ON report_blocks
      FOR DELETE
      USING (org_id = current_setting('app.current_clerk_org_id', true));

    -- Defence-in-depth: ensure report_blocks.report_id has an explicit FK to
    -- reports(id) ON DELETE CASCADE so deleting a report never orphans blocks
    -- even if a future endpoint bypasses the route's transaction.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'report_blocks'
        AND constraint_name = 'report_blocks_report_id_reports_id_fk'
    ) THEN
      ALTER TABLE report_blocks
        ADD CONSTRAINT report_blocks_report_id_reports_id_fk
        FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;
    END IF;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_preferences') THEN
    ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
    ALTER TABLE user_preferences FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS user_preferences_select ON user_preferences;
    CREATE POLICY user_preferences_select ON user_preferences
      FOR SELECT
      USING (user_id = current_setting('app.current_clerk_user_id', true));

    DROP POLICY IF EXISTS user_preferences_insert ON user_preferences;
    CREATE POLICY user_preferences_insert ON user_preferences
      FOR INSERT
      WITH CHECK (user_id = current_setting('app.current_clerk_user_id', true));

    DROP POLICY IF EXISTS user_preferences_update ON user_preferences;
    CREATE POLICY user_preferences_update ON user_preferences
      FOR UPDATE
      USING (user_id = current_setting('app.current_clerk_user_id', true))
      WITH CHECK (user_id = current_setting('app.current_clerk_user_id', true));

    DROP POLICY IF EXISTS user_preferences_delete ON user_preferences;
    CREATE POLICY user_preferences_delete ON user_preferences
      FOR DELETE
      USING (user_id = current_setting('app.current_clerk_user_id', true));
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_runs') THEN
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
  END IF;
END$$;

-- ── Async delegated analyst jobs ────────────────────────────────────────────
-- Keyed on Clerk org id (text), exactly like agents / agent_runs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_jobs') THEN
    ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agent_jobs FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS agent_jobs_select ON agent_jobs;
    CREATE POLICY agent_jobs_select ON agent_jobs
      FOR SELECT
      USING (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS agent_jobs_insert ON agent_jobs;
    CREATE POLICY agent_jobs_insert ON agent_jobs
      FOR INSERT
      WITH CHECK (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS agent_jobs_update ON agent_jobs;
    CREATE POLICY agent_jobs_update ON agent_jobs
      FOR UPDATE
      USING (org_id = current_setting('app.current_clerk_org_id', true))
      WITH CHECK (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS agent_jobs_delete ON agent_jobs;
    CREATE POLICY agent_jobs_delete ON agent_jobs
      FOR DELETE
      USING (org_id = current_setting('app.current_clerk_org_id', true));
  END IF;
END$$;

-- ── Blueprint / Playbook Library ────────────────────────────────────────────
-- Workspace-scoped Blueprints. SELECT also unions in Finsyt-curated
-- "published" rows (org_id = 'org_finsyt_published') so every workspace
-- can run the starter playbooks. INSERT/UPDATE/DELETE remain strictly
-- scoped to the caller's own org_id.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'blueprints') THEN
    ALTER TABLE blueprints ENABLE ROW LEVEL SECURITY;
    ALTER TABLE blueprints FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS blueprints_select ON blueprints;
    CREATE POLICY blueprints_select ON blueprints
      FOR SELECT
      USING (
        org_id = current_setting('app.current_clerk_org_id', true)
        OR (visibility = 'published' AND org_id = 'org_finsyt_published')
      );

    DROP POLICY IF EXISTS blueprints_insert ON blueprints;
    CREATE POLICY blueprints_insert ON blueprints
      FOR INSERT
      WITH CHECK (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND author_user_id = current_setting('app.current_clerk_user_id', true)
        OR (
          -- Allow the seed bootstrapper to install Finsyt-published rows when
          -- it explicitly enters the publisher context.
          org_id = 'org_finsyt_published'
          AND current_setting('app.current_clerk_org_id', true) = 'org_finsyt_published'
        )
      );

    DROP POLICY IF EXISTS blueprints_update ON blueprints;
    CREATE POLICY blueprints_update ON blueprints
      FOR UPDATE
      USING (org_id = current_setting('app.current_clerk_org_id', true))
      WITH CHECK (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS blueprints_delete ON blueprints;
    CREATE POLICY blueprints_delete ON blueprints
      FOR DELETE
      USING (org_id = current_setting('app.current_clerk_org_id', true));
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'blueprint_versions') THEN
    ALTER TABLE blueprint_versions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE blueprint_versions FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS blueprint_versions_select ON blueprint_versions;
    CREATE POLICY blueprint_versions_select ON blueprint_versions
      FOR SELECT
      USING (
        org_id = current_setting('app.current_clerk_org_id', true)
        OR org_id = 'org_finsyt_published'
      );

    DROP POLICY IF EXISTS blueprint_versions_insert ON blueprint_versions;
    CREATE POLICY blueprint_versions_insert ON blueprint_versions
      FOR INSERT
      WITH CHECK (
        org_id = current_setting('app.current_clerk_org_id', true)
        OR (
          org_id = 'org_finsyt_published'
          AND current_setting('app.current_clerk_org_id', true) = 'org_finsyt_published'
        )
      );

    DROP POLICY IF EXISTS blueprint_versions_delete ON blueprint_versions;
    CREATE POLICY blueprint_versions_delete ON blueprint_versions
      FOR DELETE
      USING (org_id = current_setting('app.current_clerk_org_id', true));
  END IF;
END$$;

-- Live Highlights persistence
-- Engine bookkeeping for the Live Highlights subscription. All five tables
-- key on the Clerk org id (text). Policies read the same
-- app.current_clerk_org_id GUC that audit_events / blueprints use, so
-- callers must enter withComplianceContext(orgId, ...) for every read or
-- write.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'live_highlights_settings',
    'live_highlights_calls',
    'live_highlights_pins',
    'live_highlights_notifications',
    'live_highlights_filing_signals',
    'watchlists',
    'house_style'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON %I', t, t);
      EXECUTE format(
        'CREATE POLICY %I_tenant_isolation ON %I '
        'USING (org_id = current_setting(''app.current_clerk_org_id'', true)) '
        'WITH CHECK (org_id = current_setting(''app.current_clerk_org_id'', true))',
        t, t
      );
    END IF;
  END LOOP;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'blueprint_runs') THEN
    ALTER TABLE blueprint_runs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE blueprint_runs FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS blueprint_runs_select ON blueprint_runs;
    CREATE POLICY blueprint_runs_select ON blueprint_runs
      FOR SELECT
      USING (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS blueprint_runs_insert ON blueprint_runs;
    CREATE POLICY blueprint_runs_insert ON blueprint_runs
      FOR INSERT
      WITH CHECK (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS blueprint_runs_update ON blueprint_runs;
    CREATE POLICY blueprint_runs_update ON blueprint_runs
      FOR UPDATE
      USING (org_id = current_setting('app.current_clerk_org_id', true))
      WITH CHECK (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS blueprint_runs_delete ON blueprint_runs;
    CREATE POLICY blueprint_runs_delete ON blueprint_runs
      FOR DELETE
      USING (org_id = current_setting('app.current_clerk_org_id', true));
  END IF;
END$$;

-- ── Deal-team Projects ──────────────────────────────────────────────────────
-- Four tables: projects, project_members, project_activity, project_links.
-- All key on org_id (UUID FK to organizations) via app.current_org_id,
-- same as workspaces / workspace_views.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['projects', 'project_members', 'project_activity', 'project_links'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON %I', t, t);
      EXECUTE format(
        'CREATE POLICY %I_tenant_isolation ON %I '
        'USING (org_id::text = current_setting(''app.current_org_id'', true)) '
        'WITH CHECK (org_id::text = current_setting(''app.current_org_id'', true))',
        t, t
      );
    END IF;
  END LOOP;
END$$;

-- ── Factor strategies (Factor Lab saved library) ────────────────────────────
-- Workspace-scoped saved back-test definitions. SELECT is open to every member
-- of the workspace; INSERT/UPDATE/DELETE require the row to belong to the
-- caller's org AND to have been authored by the caller. Mirrors peer_sets.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'factor_strategies') THEN
    ALTER TABLE factor_strategies ENABLE ROW LEVEL SECURITY;
    ALTER TABLE factor_strategies FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS factor_strategies_select ON factor_strategies;
    CREATE POLICY factor_strategies_select ON factor_strategies
      FOR SELECT
      USING (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS factor_strategies_insert ON factor_strategies;
    CREATE POLICY factor_strategies_insert ON factor_strategies
      FOR INSERT
      WITH CHECK (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND author_user_id = current_setting('app.current_clerk_user_id', true)
      );

    DROP POLICY IF EXISTS factor_strategies_update ON factor_strategies;
    CREATE POLICY factor_strategies_update ON factor_strategies
      FOR UPDATE
      USING (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND author_user_id = current_setting('app.current_clerk_user_id', true)
      )
      WITH CHECK (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND author_user_id = current_setting('app.current_clerk_user_id', true)
      );

    DROP POLICY IF EXISTS factor_strategies_delete ON factor_strategies;
    CREATE POLICY factor_strategies_delete ON factor_strategies
      FOR DELETE
      USING (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND author_user_id = current_setting('app.current_clerk_user_id', true)
      );
  END IF;
END$$;

-- ── Visual Workflow Editor ──────────────────────────────────────────────────
-- Workspace-scoped workflow DAG definitions. Strictly scoped to the caller's
-- own org_id for every operation; INSERT additionally pins author_user_id to
-- the acting Clerk user (same contract as agents / deck_overrides).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workflows') THEN
    ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workflows FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS workflows_select ON workflows;
    CREATE POLICY workflows_select ON workflows
      FOR SELECT
      USING (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS workflows_insert ON workflows;
    CREATE POLICY workflows_insert ON workflows
      FOR INSERT
      WITH CHECK (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND author_user_id = current_setting('app.current_clerk_user_id', true)
      );

    DROP POLICY IF EXISTS workflows_update ON workflows;
    CREATE POLICY workflows_update ON workflows
      FOR UPDATE
      USING (org_id = current_setting('app.current_clerk_org_id', true))
      WITH CHECK (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS workflows_delete ON workflows;
    CREATE POLICY workflows_delete ON workflows
      FOR DELETE
      USING (org_id = current_setting('app.current_clerk_org_id', true));
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workflow_runs') THEN
    ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workflow_runs FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS workflow_runs_select ON workflow_runs;
    CREATE POLICY workflow_runs_select ON workflow_runs
      FOR SELECT
      USING (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS workflow_runs_insert ON workflow_runs;
    CREATE POLICY workflow_runs_insert ON workflow_runs
      FOR INSERT
      WITH CHECK (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS workflow_runs_update ON workflow_runs;
    CREATE POLICY workflow_runs_update ON workflow_runs
      FOR UPDATE
      USING (org_id = current_setting('app.current_clerk_org_id', true))
      WITH CHECK (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS workflow_runs_delete ON workflow_runs;
    CREATE POLICY workflow_runs_delete ON workflow_runs
      FOR DELETE
      USING (org_id = current_setting('app.current_clerk_org_id', true));
  END IF;
END$$;

-- ── Workspace deck overrides ────────────────────────────────────────────────
-- One row per Clerk org. SELECT is open to every member of the workspace
-- (so any analyst on the deal team can see and reuse the saved pitch
-- configuration); INSERT/UPDATE/DELETE require the row to belong to the
-- caller's active org. There is no per-author restriction — this is a
-- shared team setting, not a personal preference.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'deck_overrides') THEN
    ALTER TABLE deck_overrides ENABLE ROW LEVEL SECURITY;
    ALTER TABLE deck_overrides FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS deck_overrides_select ON deck_overrides;
    CREATE POLICY deck_overrides_select ON deck_overrides
      FOR SELECT
      USING (org_id = current_setting('app.current_clerk_org_id', true));

    DROP POLICY IF EXISTS deck_overrides_insert ON deck_overrides;
    CREATE POLICY deck_overrides_insert ON deck_overrides
      FOR INSERT
      WITH CHECK (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND updated_by_user_id = current_setting('app.current_clerk_user_id', true)
      );

    DROP POLICY IF EXISTS deck_overrides_update ON deck_overrides;
    CREATE POLICY deck_overrides_update ON deck_overrides
      FOR UPDATE
      USING (org_id = current_setting('app.current_clerk_org_id', true))
      WITH CHECK (
        org_id = current_setting('app.current_clerk_org_id', true)
        AND updated_by_user_id = current_setting('app.current_clerk_user_id', true)
      );

    DROP POLICY IF EXISTS deck_overrides_delete ON deck_overrides;
    CREATE POLICY deck_overrides_delete ON deck_overrides
      FOR DELETE
      USING (org_id = current_setting('app.current_clerk_org_id', true));
  END IF;
END$$;
`;

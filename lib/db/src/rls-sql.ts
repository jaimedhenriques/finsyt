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

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['leads', 'research_notes', 'chat_messages', 'memberships', 'portfolio_positions', 'api_keys'];
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
`;

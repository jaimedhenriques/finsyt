import { pool } from "./index";

/**
 * Idempotent bootstrap for the Projects tables:
 *   `projects`, `project_members`, `project_activity`, `project_links`.
 *
 * Follows the same pattern as `ensureWorkspaceViewsSchema` — create the
 * physical tables with raw SQL on every server boot so a fresh database
 * self-heals without the developer having to run `drizzle-kit push`
 * interactively. The Drizzle definitions in `./schema/projects.ts` remain
 * the source of truth for application queries; this function only guarantees
 * the matching table/index shapes exist in Postgres.
 *
 * RLS for these tables is applied by `bootstrapRls()` (via `rls-sql.ts`)
 * inside `IF EXISTS` guards, so this bootstrap MUST run before
 * `bootstrapRls()` or the tenant-isolation policies silently won't attach.
 */
export async function ensureProjectsSchema(): Promise<void> {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      author_user_id text     NOT NULL,
      name        text        NOT NULL,
      description text        NOT NULL DEFAULT '',
      color       text        NOT NULL DEFAULT 'var(--accent)',
      status      text        NOT NULL DEFAULT 'active',
      metadata    jsonb       NOT NULL DEFAULT '{}',
      created_at  timestamp   NOT NULL DEFAULT now(),
      updated_at  timestamp   NOT NULL DEFAULT now()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS projects_org_idx ON projects (org_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS projects_org_status_idx ON projects (org_id, status)`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_members (
      id              uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id      uuid      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      org_id          uuid      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id         text      NOT NULL,
      role            text      NOT NULL DEFAULT 'member',
      added_by_user_id text     NOT NULL,
      created_at      timestamp NOT NULL DEFAULT now()
    )
  `);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_user_uniq
       ON project_members (project_id, user_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS project_members_project_idx ON project_members (project_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS project_members_org_idx ON project_members (org_id)`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_activity (
      id              uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id      uuid      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      org_id          uuid      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      actor_user_id   text      NOT NULL,
      action          text      NOT NULL,
      resource_type   text,
      resource_id     text,
      resource_label  text,
      payload         jsonb,
      created_at      timestamp NOT NULL DEFAULT now()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS project_activity_project_idx ON project_activity (project_id, created_at DESC)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS project_activity_org_idx ON project_activity (org_id)`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_links (
      id                uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id        uuid      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      org_id            uuid      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      resource_type     text      NOT NULL,
      resource_id       text      NOT NULL,
      resource_label    text      NOT NULL DEFAULT '',
      linked_by_user_id text      NOT NULL,
      created_at        timestamp NOT NULL DEFAULT now()
    )
  `);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS project_links_project_resource_uniq
       ON project_links (project_id, resource_type, resource_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS project_links_project_idx ON project_links (project_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS project_links_org_idx ON project_links (org_id)`,
  );
}

import { sql } from "drizzle-orm";
import { db, pool, withComplianceContext } from "./index";
import { recordAuditWriteFailure, recordAuditWriteSuccess } from "./audit-health";

/**
 * Canonical action names. Keep these stable — they are queried by
 * compliance reviewers and surfaced in the admin audit-log UI.
 */
export type AuditAction =
  | "auth.login.success"
  | "auth.login.failed"
  | "auth.logout"
  | "auth.password.reset"
  | "mfa.enabled"
  | "mfa.disabled"
  | "mfa.challenge.failed"
  | "role.changed"
  | "membership.added"
  | "membership.removed"
  | "sso.config.updated"
  | "sso.config.deleted"
  | "data.export.requested"
  | "data.export.completed"
  | "account.delete.requested"
  | "account.delete.completed"
  | "retention.settings.updated"
  | "retention.purge.ran";

export type ActorType = "user" | "system" | "service";

export interface AuditLogInput {
  orgId: string;
  actorId?: string | null;
  actorType?: ActorType;
  action: AuditAction | string;
  resourceType?: string | null;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append a row to the audit log. Never throws — audit failures are logged
 * to stderr but must not break the calling request.
 *
 * The INSERT runs inside `withComplianceContext` so the row-level-security
 * policies on `audit_events` (added in `ensureAuditSchema`) accept the row
 * regardless of any tenant context the caller may already be in. This also
 * means callers do not need to be inside `withOrgContext`/`withClerkContext`
 * before calling `auditLog`.
 */
export async function auditLog(input: AuditLogInput): Promise<void> {
  try {
    await ensureAuditPartition(new Date());
    await withComplianceContext(input.orgId, (tx) =>
      tx.execute(sql`
        INSERT INTO audit_events
          (org_id, actor_id, actor_type, action, resource_type, resource_id, ip, user_agent, metadata)
        VALUES
          (${input.orgId}, ${input.actorId ?? null}, ${input.actorType ?? "user"},
           ${input.action}, ${input.resourceType ?? null}, ${input.resourceId ?? null},
           ${input.ip ?? null}, ${input.userAgent ?? null},
           ${input.metadata ? JSON.stringify(input.metadata) : null}::jsonb)
      `),
    );
    recordAuditWriteSuccess();
  } catch (err) {
    // Bookkeeping + structured `event=audit.write.failed` log + threshold
    // alert all live in `audit-health.ts` so this branch stays a single
    // call and the swallow-on-failure contract above is preserved.
    recordAuditWriteFailure(err, String(input.action));
  }
}

/** Convenience namespace so call-sites read like `audit.log({...})`. */
export const audit = { log: auditLog };

function partitionRange(d: Date): { name: string; start: string; end: string } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    name: `audit_events_${y}${pad(m + 1)}`,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

const partitionsEnsured = new Set<string>();

/**
 * Idempotently ensures the monthly partition that covers `d` exists.
 * Cached in-process to avoid a round-trip per insert.
 */
export async function ensureAuditPartition(d: Date): Promise<void> {
  const { name, start, end } = partitionRange(d);
  if (partitionsEnsured.has(name)) return;
  await db.execute(sql.raw(
    `CREATE TABLE IF NOT EXISTS "${name}" PARTITION OF audit_events ` +
    `FOR VALUES FROM ('${start}') TO ('${end}')`,
  ));
  partitionsEnsured.add(name);
}

/**
 * One-shot bootstrap that creates the partitioned parent table, the
 * supporting indexes, and the partitions for the current and next month.
 * Safe to call repeatedly; runs at api-server start.
 */
export async function ensureAuditSchema(): Promise<void> {
  // Pgcrypto provides gen_random_uuid() on older Postgres; harmless on newer.
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  // Self-heal: an earlier version of this bootstrap created `audit_events`
  // without `PARTITION BY RANGE`, and `CREATE TABLE IF NOT EXISTS ...
  // PARTITION BY RANGE` silently no-ops when the table already exists in
  // the wrong shape — leaving every subsequent `CREATE TABLE ... PARTITION
  // OF audit_events` to fail with `"audit_events" is not partitioned`.
  // Detect that case, rename the legacy table out of the way, and let the
  // CREATE TABLE below build the partitioned parent. Legacy rows are
  // copied across after the partitions exist (see below).
  await pool.query(`
    DO $$
    DECLARE
      is_partitioned boolean;
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_events' AND relkind = 'r') THEN
        SELECT EXISTS (
          SELECT 1 FROM pg_partitioned_table p
          JOIN pg_class c ON c.oid = p.partrelid
          WHERE c.relname = 'audit_events'
        ) INTO is_partitioned;
        IF NOT is_partitioned THEN
          ALTER TABLE audit_events RENAME TO audit_events_legacy;
          ALTER INDEX IF EXISTS audit_events_action_time_idx
            RENAME TO audit_events_legacy_action_time_idx;
          ALTER INDEX IF EXISTS audit_events_org_time_idx
            RENAME TO audit_events_legacy_org_time_idx;
          ALTER INDEX IF EXISTS audit_events_id_occurred_at_pk
            RENAME TO audit_events_legacy_pk;
        END IF;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      occurred_at timestamptz NOT NULL DEFAULT now(),
      org_id text NOT NULL,
      actor_id text,
      actor_type text NOT NULL,
      action text NOT NULL,
      resource_type text,
      resource_id text,
      ip text,
      user_agent text,
      metadata jsonb,
      PRIMARY KEY (id, occurred_at)
    ) PARTITION BY RANGE (occurred_at)
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS audit_events_org_time_idx
       ON audit_events (org_id, occurred_at DESC)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS audit_events_action_time_idx
       ON audit_events (action, occurred_at DESC)`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_retention_settings (
      org_id text PRIMARY KEY,
      audit_log_days integer NOT NULL DEFAULT 365,
      transient_log_days integer NOT NULL DEFAULT 30,
      abandoned_chat_days integer NOT NULL DEFAULT 90,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_deletion_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id text NOT NULL,
      actor_id text NOT NULL,
      reason text,
      requested_at timestamptz NOT NULL DEFAULT now(),
      scheduled_for timestamptz NOT NULL,
      completed_at timestamptz,
      status text NOT NULL DEFAULT 'pending'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS data_export_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id text NOT NULL,
      actor_id text NOT NULL,
      format text NOT NULL DEFAULT 'json',
      byte_size integer,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Partitions for the current and next month.
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  await ensureAuditPartition(now);
  await ensureAuditPartition(next);

  // If the self-heal block above renamed a legacy non-partitioned table,
  // copy its rows into the new partitioned parent (creating monthly
  // partitions for any historical months as needed) and drop it.
  await pool.query(`
    DO $$
    DECLARE
      min_at timestamptz;
      max_at timestamptz;
      cursor_month timestamptz;
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_events_legacy' AND relkind = 'r') THEN
        SELECT min(occurred_at), max(occurred_at) INTO min_at, max_at FROM audit_events_legacy;
        IF min_at IS NOT NULL THEN
          cursor_month := date_trunc('month', min_at);
          WHILE cursor_month <= date_trunc('month', max_at) LOOP
            EXECUTE format(
              'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_events FOR VALUES FROM (%L) TO (%L)',
              'audit_events_' || to_char(cursor_month, 'YYYYMM'),
              cursor_month,
              cursor_month + interval '1 month'
            );
            cursor_month := cursor_month + interval '1 month';
          END LOOP;
          INSERT INTO audit_events SELECT * FROM audit_events_legacy;
        END IF;
        DROP TABLE audit_events_legacy;
      END IF;
    END $$;
  `);

  // Defense-in-depth tenant isolation: enable (and FORCE) row-level
  // security on every compliance table and install a single
  // SELECT/INSERT/UPDATE/DELETE policy keyed off `app.current_clerk_org_id`.
  // Mirrors the bootstrap pattern in `lib/db/src/rls.sql` for tables that
  // already use the Clerk org id channel. RLS on a partitioned table
  // (`audit_events`) automatically applies to every existing and future
  // partition, so the monthly partition tables do not need separate
  // policies. Idempotent — safe to re-run on every server start.
  //
  // The api-server / cron must enter `withComplianceContext(orgId, …)`
  // before reading or writing these tables; `auditLog` and
  // `purgeAuditEvents` already do so internally.
  await pool.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      audit_events,
      org_retention_settings,
      account_deletion_requests,
      data_export_requests
    TO app_runtime;
  `);
  await pool.query(`
    DO $$
    DECLARE
      t text;
      tables text[] := ARRAY[
        'audit_events',
        'org_retention_settings',
        'account_deletion_requests',
        'data_export_requests'
      ];
    BEGIN
      FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON %I', t, t);
        EXECUTE format(
          'CREATE POLICY %I_tenant_isolation ON %I '
          'USING (org_id = current_setting(''app.current_clerk_org_id'', true)) '
          'WITH CHECK (org_id = current_setting(''app.current_clerk_org_id'', true))',
          t, t
        );
      END LOOP;
    END $$;
  `);
}

/**
 * Purge old audit events for an org based on retention settings.
 * Returns the number of rows removed.
 */
export async function purgeAuditEvents(orgId: string, retainDays: number): Promise<number> {
  if (retainDays <= 0) return 0;
  return withComplianceContext(orgId, async (tx) => {
    const res = await tx.execute(sql`
      DELETE FROM audit_events
       WHERE org_id = ${orgId}
         AND occurred_at < now() - (${retainDays}::int || ' days')::interval
    `);
    return res.rowCount ?? 0;
  });
}

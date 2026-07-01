import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Sentinel org id used by privileged system code paths (e.g. background jobs,
 * marketing lead capture from anonymous visitors). Rows owned by this org are
 * still subject to RLS — only callers that explicitly enter this context can
 * read or write them.
 */
export const SYSTEM_ORG_ID = "00000000-0000-0000-0000-000000000000";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ROLE_RE = /^[a-z_][a-z0-9_]*$/;

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`${label} must be a UUID, got ${JSON.stringify(value)}`);
  }
}

/**
 * Role to switch into for every per-tenant transaction. When the connection
 * string uses a superuser or BYPASSRLS role, those connections ignore all RLS
 * policies, making tenant isolation solely dependent on application-level
 * filters. Setting DB_RUNTIME_ROLE to a low-privilege `app_runtime` role
 * ensures that `SET LOCAL ROLE` drops privileges before any user query runs,
 * so RLS provides an independent enforcement layer.
 *
 * REQUIRED in any deployment where the connection role is a superuser or has
 * BYPASSRLS. Call `assertRlsSafe()` at server startup to enforce this.
 */
const RUNTIME_ROLE = process.env.DB_RUNTIME_ROLE?.trim();
if (RUNTIME_ROLE && !SAFE_ROLE_RE.test(RUNTIME_ROLE)) {
  throw new Error(`DB_RUNTIME_ROLE must match ${SAFE_ROLE_RE}`);
}

/**
 * Bootstrap RLS on first boot: creates the low-privilege `app_runtime`
 * role, grants table privileges, and re-applies all tenant-isolation
 * policies. The SQL is wrapped in a single transaction and is idempotent
 * (safe to call on every server start).
 *
 * Call BEFORE `assertRlsSafe()` so a fresh deployment can self-heal — a
 * brand-new production database has neither the role nor the policies, and
 * the only privileged identity that can create them is the connection role
 * the app already holds. If this fails, the error is swallowed with a
 * console warning so a transient DB hiccup doesn't crash the server; the
 * subsequent `assertRlsSafe()` will still surface a misconfiguration.
 */
export async function bootstrapRls(
  directPool?: import("pg").Pool,
): Promise<boolean> {
  const { RLS_SQL } = await import("./rls-sql");
  const targetPool = directPool ?? pool;
  const client = await targetPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(RLS_SQL);
    await client.query("COMMIT");
    return true;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line no-console
    console.warn("[bootstrapRls] failed to apply RLS bootstrap:", err);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Fail-closed RLS safety check. Call this once at server startup (e.g. in
 * Next.js instrumentation or Express app init). It queries Postgres to
 * determine whether the connection role can bypass RLS. If the role is
 * privileged (superuser or BYPASSRLS) and DB_RUNTIME_ROLE is not configured,
 * this throws — because in that configuration every `withOrgContext` /
 * `withClerkContext` call silently skips all tenant-isolation policies.
 *
 * In a correctly configured deployment (non-privileged connection role, or
 * DB_RUNTIME_ROLE set to `app_runtime`), this is a no-op.
 */
export async function assertRlsSafe(): Promise<void> {
  if (RUNTIME_ROLE) {
    // role downgrade is configured — verify the role exists AND is non-privileged.
    // A privileged runtime role defeats the entire purpose of SET LOCAL ROLE: the
    // switched role would still bypass RLS, making tenant isolation silently fail.
    const roleCheck = await pool.query<{ exists: boolean; bypasses: boolean }>(
      `SELECT
         EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists,
         COALESCE(
           (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = $1),
           false
         ) AS bypasses`,
      [RUNTIME_ROLE],
    );
    if (!roleCheck.rows[0]?.exists) {
      throw new Error(
        `DB_RUNTIME_ROLE=${RUNTIME_ROLE} is configured but that role does not exist ` +
          "in the database. bootstrapRls() should create it on first boot — if this " +
          "error persists, check the [bootstrapRls] warning earlier in the logs.",
      );
    }
    if (roleCheck.rows[0]?.bypasses) {
      throw new Error(
        `DB_RUNTIME_ROLE=${RUNTIME_ROLE} is a superuser or has BYPASSRLS. ` +
          "Switching into a privileged role defeats RLS tenant isolation — every " +
          "per-tenant query would still see all rows regardless of the active policy. " +
          "Set DB_RUNTIME_ROLE to a non-privileged role such as app_runtime.",
      );
    }
    return;
  }
  const result = await pool.query<{ bypasses: boolean }>(
    `SELECT (rolsuper OR rolbypassrls) AS bypasses
       FROM pg_roles
      WHERE rolname = current_user`,
  );
  const bypasses = result.rows[0]?.bypasses ?? false;
  if (bypasses) {
    throw new Error(
      "DB_RUNTIME_ROLE is not set but the database connection role is a superuser " +
        "or has BYPASSRLS. Row-level security policies will be silently ignored, " +
        "which breaks tenant isolation. Set DB_RUNTIME_ROLE=app_runtime (or another " +
        "non-privileged role) to enforce RLS on every per-tenant transaction.",
    );
  }
}

/**
 * Run `fn` inside a transaction with the per-request tenant id bound to
 * `app.current_org_id`. Postgres row-level security policies on every tenant
 * table reference this setting, so any query that "forgets" a WHERE clause
 * still cannot see another tenant's rows.
 */
export async function withOrgContext<T>(
  orgId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  assertUuid(orgId, "orgId");
  return db.transaction(async (tx) => {
    if (RUNTIME_ROLE) {
      // SAFE_ROLE_RE has already validated the identifier, so direct
      // interpolation is safe. SET ROLE does not accept parameter binding.
      await tx.execute(sql.raw(`SET LOCAL ROLE ${RUNTIME_ROLE}`));
    }
    // set_config(name, value, is_local=true) === SET LOCAL, but parametrisable.
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

/**
 * Variant of `withOrgContext` for tables keyed on Clerk identifiers (text
 * `org_…` / `user_…`) rather than internal UUIDs. Sets the parallel pair of
 * GUCs that the RLS policies on those tables read — see `rls.sql`.
 *
 * Use for any query against `screener_presets` (and future Clerk-id-keyed
 * tables). The id format check guards against stray values reaching the
 * database; the GUC channel itself is not SQL-injectable because we use
 * parameter binding via `set_config(name, value, is_local)`.
 */
// Note: underscores after the `org_` / `user_` prefix are allowed so that
// the platform's PLATFORM_OPEN_MODE demo principal (`org_demo_open_mode` /
// `user_demo_open_mode`) passes the format guard. Real Clerk IDs are
// `[A-Za-z0-9]+` after the prefix, so this widening only enables demo mode.
const CLERK_ORG_RE = /^org_[A-Za-z0-9_]+$/;
const CLERK_USER_RE = /^user_[A-Za-z0-9_]+$/;

export async function withClerkContext<T>(
  orgId: string,
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!CLERK_ORG_RE.test(orgId)) {
    throw new Error(`orgId must be a Clerk org id, got ${JSON.stringify(orgId)}`);
  }
  if (!CLERK_USER_RE.test(userId)) {
    throw new Error(`userId must be a Clerk user id, got ${JSON.stringify(userId)}`);
  }
  return db.transaction(async (tx) => {
    if (RUNTIME_ROLE) {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${RUNTIME_ROLE}`));
    }
    await tx.execute(sql`SELECT set_config('app.current_clerk_org_id', ${orgId}, true)`);
    await tx.execute(sql`SELECT set_config('app.current_clerk_user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/**
 * Variant of `withClerkContext` for tables that are scoped to an individual
 * user rather than to a workspace — currently `user_preferences`. Sets only
 * the `app.current_clerk_user_id` GUC; the matching RLS policies enforce
 * that every read/write is restricted to the row whose `user_id` matches.
 *
 * Use this for endpoints that should follow a user across orgs (and that
 * still need to work for signed-in users without an active org).
 */
export async function withClerkUserContext<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!CLERK_USER_RE.test(userId)) {
    throw new Error(`userId must be a Clerk user id, got ${JSON.stringify(userId)}`);
  }
  return db.transaction(async (tx) => {
    if (RUNTIME_ROLE) {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${RUNTIME_ROLE}`));
    }
    await tx.execute(sql`SELECT set_config('app.current_clerk_user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/**
 * Run `fn` inside a transaction with the tenant id bound to
 * `app.current_clerk_org_id` for the compliance tables (`audit_events`,
 * `org_retention_settings`, `account_deletion_requests`,
 * `data_export_requests`). These tables key on text org ids (Clerk-style
 * `org_…`) and have RLS policies (added in `ensureAuditSchema`) that read
 * from the same GUC channel as `withClerkContext`.
 *
 * Unlike `withClerkContext`, this helper does not require an associated
 * user id — the nightly retention/purge cron operates per-org without
 * user context, but still benefits from running under the low-privilege
 * runtime role so a forgotten WHERE clause cannot leak across tenants.
 *
 * Accepts any text id matching the safe character set used for both
 * Clerk and legacy ids; raw values flow through `set_config` parameter
 * binding so injection is not possible.
 */
const ORG_CTX_RE = /^[A-Za-z0-9_-]+$/;

export async function withComplianceContext<T>(
  orgId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (typeof orgId !== "string" || !ORG_CTX_RE.test(orgId) || orgId.length > 200) {
    throw new Error(
      `orgId must match ${ORG_CTX_RE} and be <= 200 chars, got ${JSON.stringify(orgId)}`,
    );
  }
  return db.transaction(async (tx) => {
    if (RUNTIME_ROLE) {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${RUNTIME_ROLE}`));
    }
    await tx.execute(sql`SELECT set_config('app.current_clerk_org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

/**
 * Run `fn` against a privileged pool client for an explicitly cross-tenant
 * scan (e.g. the nightly retention cron enumerating every org with retention
 * settings, or every `account_deletion_requests` row that has hit its SLA).
 *
 * Compliance tables have FORCE ROW LEVEL SECURITY enabled, which means even
 * the table owner is filtered by the tenant-isolation policy. The only
 * connection roles that can perform a true cross-tenant SELECT are roles
 * with `rolsuper` or `rolbypassrls`. This helper asserts that requirement
 * before running `fn`, so a misconfigured deployment fails fast at the
 * scan instead of silently returning zero rows (which would cause the
 * cron to skip retention purges and account deletions undetected).
 *
 * Use this only for genuinely cross-tenant administrative work. All
 * per-org reads/writes must go through `withComplianceContext`.
 */
export async function withAdminScan<T>(
  label: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    const r = await client.query<{ bypasses: boolean }>(
      `SELECT (rolsuper OR rolbypassrls) AS bypasses
         FROM pg_roles
        WHERE rolname = current_user`,
    );
    if (!r.rows[0]?.bypasses) {
      throw new Error(
        `withAdminScan(${label}): the database connection role ` +
          "is neither a superuser nor has BYPASSRLS, so cross-tenant " +
          "scans on FORCE-RLS compliance tables would silently return " +
          "zero rows. Run this script with a privileged connection role " +
          "(the same role that bootstrapRls uses to install policies).",
      );
    }
    return await fn(client);
  } finally {
    client.release();
  }
}

export * from "./schema";
export * from "./audit";
export * from "./audit-health";
export * from "./blueprint-bootstrap";
export * from "./workflows-bootstrap";
export * from "./deck-overrides-bootstrap";
export * from "./house-style-bootstrap";
export * from "./reports-bootstrap";
export * from "./live-highlights-bootstrap";
export * from "./workspace-views-bootstrap";
export * from "./projects-bootstrap";
export * from "./ensure-private-company-schema";

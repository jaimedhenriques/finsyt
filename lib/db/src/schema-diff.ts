import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/drizzle-managed";

const { Pool } = pg;

/**
 * Tables drizzle-kit must never diff. These are owned by bootstrap code, not by
 * the drizzle-managed schema, so drizzle-kit would otherwise perpetually report
 * them as "drift" (it wants to drop them) even on a perfectly healthy database:
 *
 *  - audit_events*            partitioned table + monthly children, owned by
 *                             ensureAuditSchema() (src/audit.ts).
 *  - data_export_requests,
 *    org_retention_settings,
 *    account_deletion_requests
 *                             compliance tables, also owned by
 *                             ensureAuditSchema(); intentionally excluded from
 *                             drizzle-managed.ts.
 */
const TABLES_FILTER = [
  "!audit_events*",
  "!data_export_requests",
  "!org_retention_settings",
  "!account_deletion_requests",
];

/**
 * Sentinel returned in place of a composite primary-key constraint name during
 * introspection. See {@link makeIntrospectionShim} for why this is necessary.
 */
const COMPOSITE_PK_SENTINEL = "__drift_probe_composite_pk__";

export interface SchemaDiffResult {
  /** true when the live database already matches the Drizzle schema. */
  inSync: boolean;
  /** Number of genuine drift statements drizzle-kit would run. */
  statementCount: number;
  /** The genuine drift DDL statements (read-only preview). */
  statements: string[];
  /** true when reconciling the drift would drop columns/tables (data loss). */
  hasDataLoss: boolean;
  /**
   * Number of statements that were classified as expected/managed-elsewhere
   * noise and excluded from the drift count (RLS, defaults, composite-PK
   * naming churn). Surfaced for transparency.
   */
  ignoredCount: number;
  /** Human-readable warnings drizzle-kit raised while computing the diff. */
  warnings: string[];
}

/**
 * Extract the raw SQL text from a drizzle `SQL` object produced by `sql.raw()`.
 * drizzle-kit's pushSchema wraps every introspection query as
 * `drizzleInstance.execute(sql.raw(query))`, so the text lives in queryChunks.
 */
function extractRawSql(query: unknown): string {
  const q = query as { queryChunks?: unknown[] };
  if (q && Array.isArray(q.queryChunks)) {
    return q.queryChunks
      .map((chunk) => {
        if (chunk == null) return "";
        if (typeof chunk === "string") return chunk;
        const value = (chunk as { value?: unknown }).value;
        if (Array.isArray(value)) return value.join("");
        if (typeof value === "string") return value;
        return "";
      })
      .join("");
  }
  return typeof query === "string" ? query : "";
}

/**
 * Build a drizzle instance whose `execute` works around a drizzle-kit bug.
 *
 * drizzle-kit's `pushSchema` introspects the database through a wrapper that
 * drops query parameters:
 *
 *   query: async (query, params) =>
 *     (await drizzleInstance.execute(sql.raw(query))).rows
 *
 * Every introspection query inlines its values as literals EXCEPT the
 * composite-primary-key lookup, which is parameterised
 * (`connamespace = $1::regnamespace AND pg_class.relname = $2`). Because the
 * params are dropped, Postgres errors "there is no parameter $1" and the whole
 * diff crashes for any schema containing a composite primary key.
 *
 * We cannot recover the dropped params (the table identity is lost and tables
 * are introspected concurrently), so we short-circuit just that one query with
 * a sentinel constraint name. The diff then reports a harmless name-only change
 * for every composite PK, which classifyStatements() filters back out.
 */
function makeIntrospectionShim(pool: pg.Pool) {
  const db = drizzle(pool);
  const realExecute = db.execute.bind(db);
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "execute") {
        return async (query: unknown) => {
          const raw = extractRawSql(query);
          if (
            raw.includes("connamespace = $1::regnamespace") &&
            raw.includes("pg_class.relname = $2")
          ) {
            return { rows: [{ primary_key: COMPOSITE_PK_SENTINEL }] };
          }
          return realExecute(query as Parameters<typeof realExecute>[0]);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

const RLS_ENABLEMENT = /\b(ENABLE|DISABLE) ROW LEVEL SECURITY\b/i;
const RLS_POLICY = /^(CREATE|DROP|ALTER) POLICY\b/i;
const COLUMN_DEFAULT = /\bALTER COLUMN\b.*\b(SET|DROP) DEFAULT\b/i;
const COMPOSITE_PK_DROP = new RegExp(
  `DROP CONSTRAINT "${COMPOSITE_PK_SENTINEL}"`,
);
const ADD_PRIMARY_KEY = /ALTER TABLE "([^"]+)" ADD CONSTRAINT "[^"]+" PRIMARY KEY/i;
const TABLE_OF = /ALTER TABLE "([^"]+)"/i;

/**
 * Split drizzle-kit's statement list into genuine drift vs. expected noise.
 *
 * Statements ignored as expected/managed-elsewhere:
 *  - Row-level security enablement and CREATE/DROP/ALTER POLICY: RLS is owned
 *    by bootstrapRls() (`pnpm --filter @workspace/db run rls`), not the schema.
 *  - Column default changes: drizzle-kit re-emits jsonb/array/int defaults
 *    (e.g. `'[]'::jsonb` vs `[]`) on every push; these self-heal and never
 *    represent structural drift.
 *  - Composite primary-key naming churn produced by the introspection shim
 *    above: a `DROP CONSTRAINT <sentinel>` paired with a re-`ADD ... PRIMARY
 *    KEY` on the same table is a no-op rename. An unpaired re-add (DB lacks the
 *    PK) is genuine drift and is kept.
 */
function classifyStatements(statements: string[]): {
  drift: string[];
  ignored: string[];
} {
  const tablesWithSentinelDrop = new Set<string>();
  for (const stmt of statements) {
    if (COMPOSITE_PK_DROP.test(stmt)) {
      const table = stmt.match(TABLE_OF)?.[1];
      if (table) tablesWithSentinelDrop.add(table);
    }
  }

  const drift: string[] = [];
  const ignored: string[] = [];
  for (const stmt of statements) {
    if (RLS_ENABLEMENT.test(stmt) || RLS_POLICY.test(stmt)) {
      ignored.push(stmt);
      continue;
    }
    if (COLUMN_DEFAULT.test(stmt)) {
      ignored.push(stmt);
      continue;
    }
    if (COMPOSITE_PK_DROP.test(stmt)) {
      ignored.push(stmt);
      continue;
    }
    const addPk = stmt.match(ADD_PRIMARY_KEY);
    if (addPk && tablesWithSentinelDrop.has(addPk[1])) {
      ignored.push(stmt);
      continue;
    }
    drift.push(stmt);
  }
  return { drift, ignored };
}

/**
 * Compute whether the live database schema matches the Drizzle schema, without
 * mutating the database.
 *
 * This reuses drizzle-kit's programmatic `pushSchema` API (the same engine that
 * `drizzle-kit push` runs) but only inspects the statements it would execute —
 * it never calls the returned `apply()`, so the database is left untouched.
 *
 * The raw statement list is then filtered down to genuine structural drift via
 * classifyStatements(): this codebase manages RLS, audit/compliance tables, and
 * some column defaults outside of drizzle-kit, so those always appear as "drift"
 * against the schema even on a healthy database. An empty drift list means the
 * schema is in sync.
 *
 * Uses DATABASE_MIGRATION_URL (falling back to DATABASE_URL) so it inspects the
 * exact same connection drizzle-kit push targets.
 */
export async function computeSchemaDiff(): Promise<SchemaDiffResult> {
  const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL must be set");
  }

  // drizzle-kit's programmatic API lives in a heavy dev dependency; load it
  // lazily so importing this module never drags drizzle-kit into a bundle
  // unless the diff is actually run. Next's production build additionally keeps
  // drizzle-kit external via a `webpack` externals rule in next.config.ts so
  // webpack never tries to bundle its internals (esbuild, optional pg drivers).
  const { pushSchema } = await import("drizzle-kit/api");

  const pool = new Pool({ connectionString: url });
  try {
    const db = makeIntrospectionShim(pool);
    const { warnings, statementsToExecute } = await pushSchema(
      schema as Record<string, unknown>,
      // pushSchema's typing is intentionally broad across drivers.
      db as unknown as Parameters<typeof pushSchema>[1],
      undefined,
      TABLES_FILTER,
    );

    const { drift, ignored } = classifyStatements(statementsToExecute);
    const hasDataLoss = drift.some((stmt) =>
      /\bDROP (TABLE|COLUMN)\b/i.test(stmt),
    );

    return {
      inSync: drift.length === 0,
      statementCount: drift.length,
      statements: drift,
      hasDataLoss,
      ignoredCount: ignored.length,
      warnings,
    };
  } finally {
    await pool.end();
  }
}

// re-exported for the CLI's verbose output and tests.
export { COMPOSITE_PK_SENTINEL, TABLES_FILTER };

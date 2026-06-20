/**
 * Scheduled retention / DSAR purge job.
 *
 * Run nightly via cron (Replit Scheduled Deployments or any external
 * scheduler):
 *
 *   pnpm --filter @workspace/scripts tsx scripts/run-retention-purge.ts
 *
 * The job:
 *   1. Iterates every org with retention settings and purges audit
 *      events older than `audit_log_days`.
 *   2. Purges transient logs and abandoned chat sessions per the
 *      org's retention policy. The job tolerates these tables being
 *      absent — the schema is added incrementally as those product
 *      surfaces ship (see SECURITY.md §9).
 *   3. Hard-deletes accounts whose `account_deletion_requests` row has
 *      passed its `scheduled_for` window (the 30-day SLA). Removes
 *      every actor-linked row across our owned tables and pseudonymises
 *      the actor identifier in the completion audit event so personal
 *      data is not reintroduced post-deletion.
 *   4. Records each action back to the audit log so the work is
 *      traceable end-to-end.
 */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  pool,
  auditLog,
  purgeAuditEvents,
  ensureAuditSchema,
  withComplianceContext,
  withAdminScan,
} from "@workspace/db";

/** SHA-256 truncated for readability — irreversible without the raw id. */
function pseudonymise(actorId: string): string {
  return "anon:" + createHash("sha256").update(actorId).digest("hex").slice(0, 16);
}

/** Returns true if a regclass exists; used so this job is forward-compatible
 *  with tables that don't exist yet on every deployment. */
async function tableExists(qualified: string): Promise<boolean> {
  const r = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [qualified],
  );
  return r.rows[0]?.exists === true;
}

async function purgeTransientLogs(orgId: string, retainDays: number): Promise<number> {
  if (retainDays <= 0) return 0;
  if (!(await tableExists("public.transient_logs"))) return 0;
  const r = await pool.query(
    `DELETE FROM transient_logs
       WHERE org_id = $1 AND created_at < now() - ($2::int || ' days')::interval`,
    [orgId, retainDays],
  );
  return r.rowCount ?? 0;
}

async function purgeAbandonedChats(orgId: string, retainDays: number): Promise<number> {
  if (retainDays <= 0) return 0;
  if (!(await tableExists("public.chat_sessions"))) return 0;
  const r = await pool.query(
    `DELETE FROM chat_sessions
       WHERE org_id = $1
         AND status = 'abandoned'
         AND last_activity_at < now() - ($2::int || ' days')::interval`,
    [orgId, retainDays],
  );
  return r.rowCount ?? 0;
}

async function main() {
  await ensureAuditSchema();

  // Cross-tenant scan: enumerate every org's retention settings.
  // `org_retention_settings` has FORCE RLS enabled, so this scan must run
  // through `withAdminScan`, which asserts the connection role can bypass
  // RLS and fails fast otherwise (rather than silently returning zero rows
  // and skipping every retention purge undetected).
  const settings = await withAdminScan("org_retention_settings", (client) =>
    client.query<{
      org_id: string;
      audit_log_days: number;
      transient_log_days: number;
      abandoned_chat_days: number;
    }>(
      `SELECT org_id, audit_log_days, transient_log_days, abandoned_chat_days
         FROM org_retention_settings`,
    ),
  );

  let totalAudit = 0;
  let totalTransient = 0;
  let totalChats = 0;
  for (const row of settings.rows) {
    const auditRemoved = await purgeAuditEvents(row.org_id, row.audit_log_days);
    const transientRemoved = await purgeTransientLogs(row.org_id, row.transient_log_days);
    const chatsRemoved = await purgeAbandonedChats(row.org_id, row.abandoned_chat_days);
    totalAudit += auditRemoved;
    totalTransient += transientRemoved;
    totalChats += chatsRemoved;
    if (auditRemoved + transientRemoved + chatsRemoved > 0) {
      await auditLog({
        orgId: row.org_id,
        actorType: "system",
        action: "retention.purge.ran",
        metadata: {
          auditEventsRemoved: auditRemoved,
          transientLogsRemoved: transientRemoved,
          abandonedChatsRemoved: chatsRemoved,
          retainDays: {
            audit: row.audit_log_days,
            transient: row.transient_log_days,
            abandonedChats: row.abandoned_chat_days,
          },
        },
      });
    }
  }

  // Cross-tenant scan: list account-deletion requests across all tenants
  // whose 30-day SLA has elapsed. `account_deletion_requests` has FORCE RLS,
  // so the same admin-scan guarantees apply here too.
  const due = await withAdminScan("account_deletion_requests.due", (client) =>
    client.query<{ id: string; org_id: string; actor_id: string }>(
      `SELECT id, org_id, actor_id
         FROM account_deletion_requests
        WHERE status = 'pending' AND scheduled_for <= now()`,
    ),
  );

  for (const row of due.rows) {
    // Hard-delete every actor-linked row across the tables we own.
    // New tenant tables must be added here as they are introduced.
    //
    // Compliance tables (audit_events, data_export_requests,
    // account_deletion_requests) have FORCE RLS enabled (see
    // ensureAuditSchema), so each per-org write must run inside
    // withComplianceContext so the policy clause matches.
    await withComplianceContext(row.org_id, async (tx) => {
      await tx.execute(sql`
        DELETE FROM audit_events
         WHERE org_id = ${row.org_id} AND actor_id = ${row.actor_id}
      `);
      await tx.execute(sql`
        DELETE FROM data_export_requests
         WHERE org_id = ${row.org_id} AND actor_id = ${row.actor_id}
      `);
      // Mark the request itself completed, then drop sibling deletion rows
      // so we don't keep PII on the request record after the SLA window.
      await tx.execute(sql`
        UPDATE account_deletion_requests
           SET status = 'completed', completed_at = now(), reason = NULL
         WHERE id = ${row.id}
      `);
      await tx.execute(sql`
        DELETE FROM account_deletion_requests
         WHERE org_id = ${row.org_id} AND actor_id = ${row.actor_id} AND status <> 'completed'
      `);
    });
    if (await tableExists("public.chat_sessions")) {
      await pool.query(`DELETE FROM chat_sessions WHERE org_id = $1 AND actor_id = $2`, [
        row.org_id,
        row.actor_id,
      ]);
    }
    if (await tableExists("public.transient_logs")) {
      await pool.query(`DELETE FROM transient_logs WHERE org_id = $1 AND actor_id = $2`, [
        row.org_id,
        row.actor_id,
      ]);
    }

    // The completion event uses a pseudonym instead of the raw actor_id
    // so PII is not reintroduced into the audit log we just purged.
    await auditLog({
      orgId: row.org_id,
      actorType: "system",
      action: "account.delete.completed",
      resourceType: "account",
      resourceId: pseudonymise(row.actor_id),
      metadata: { requestId: row.id },
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `[retention-purge] done — orgs=${settings.rowCount} audit=${totalAudit} ` +
      `transient=${totalTransient} chats=${totalChats} deletions=${due.rowCount}`,
  );
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[retention-purge] failed", err);
  process.exit(1);
});

import { Router } from "express";
import { sql } from "drizzle-orm";
import { auditLog, getAuditWriteHealth, withComplianceContext } from "@workspace/db";
import { logger } from "../lib/logger";
import { writeLimiter, expensiveLimiter } from "../middlewares/rateLimit";
import { requireActor, requireOwner } from "../lib/actor";

const router = Router();

/**
 * GET /api/admin/audit/health
 * Snapshot of the in-process audit-write counters and the rolling
 * failure-rate window. Owner-only because the snapshot includes the
 * most recent failure reason, which can leak DB error text.
 *
 * For automated alerting, prefer subscribing to the `event=audit.write.alert`
 * structured log line emitted by `lib/db/src/audit-health.ts` — that fires
 * proactively whenever the rolling failure rate crosses the configured
 * threshold and does not require polling this endpoint.
 */
router.get("/admin/audit/health", requireOwner, (_req, res) => {
  res.json(getAuditWriteHealth());
});

/**
 * GET /api/admin/audit
 * Filterable audit trail for the caller's org. Owner-only.
 *   ?action=auth.login.success
 *   ?actorId=...
 *   ?from=2026-01-01&to=2026-04-30
 *   ?limit=100  (max 500)
 */
router.get("/admin/audit", requireOwner, async (req, res) => {
  const orgId = req.actor!.orgId;
  const action = typeof req.query.action === "string" ? req.query.action : undefined;
  const actorId = typeof req.query.actorId === "string" ? req.query.actorId : undefined;
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  try {
    const rows = await withComplianceContext(orgId, (tx) =>
      tx.execute(sql`
        SELECT id, occurred_at, org_id, actor_id, actor_type, action,
               resource_type, resource_id, ip, user_agent, metadata
          FROM audit_events
         WHERE org_id = ${orgId}
           ${action ? sql`AND action = ${action}` : sql``}
           ${actorId ? sql`AND actor_id = ${actorId}` : sql``}
           ${from && !isNaN(from.valueOf()) ? sql`AND occurred_at >= ${from.toISOString()}` : sql``}
           ${to && !isNaN(to.valueOf()) ? sql`AND occurred_at <= ${to.toISOString()}` : sql``}
         ORDER BY occurred_at DESC
         LIMIT ${limit}
      `),
    );
    return res.json({ events: rows.rows });
  } catch (err) {
    logger.error({ err }, "Failed to query audit events");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/audit/export.csv
 * Streams the full filtered audit trail as CSV. Owner-only, expensive bucket.
 */
router.get("/admin/audit/export.csv", expensiveLimiter, requireOwner, async (req, res) => {
  const orgId = req.actor!.orgId;
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;

  try {
    const result = await withComplianceContext(orgId, (tx) =>
      tx.execute(sql`
        SELECT occurred_at, actor_id, actor_type, action, resource_type, resource_id, ip, user_agent, metadata
          FROM audit_events
         WHERE org_id = ${orgId}
           ${from && !isNaN(from.valueOf()) ? sql`AND occurred_at >= ${from.toISOString()}` : sql``}
           ${to && !isNaN(to.valueOf()) ? sql`AND occurred_at <= ${to.toISOString()}` : sql``}
         ORDER BY occurred_at DESC
      `),
    );
    const rows = result.rows as Array<Record<string, unknown>>;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-${orgId}-${Date.now()}.csv"`,
    );
    const header = [
      "occurred_at",
      "actor_id",
      "actor_type",
      "action",
      "resource_type",
      "resource_id",
      "ip",
      "user_agent",
      "metadata",
    ].join(",");
    res.write(header + "\n");
    for (const r of rows) {
      const occurred = r.occurred_at;
      res.write(
        [
          occurred instanceof Date ? occurred.toISOString() : String(occurred ?? ""),
          csv(r.actor_id),
          csv(r.actor_type),
          csv(r.action),
          csv(r.resource_type),
          csv(r.resource_id),
          csv(r.ip),
          csv(r.user_agent),
          csv(r.metadata ? JSON.stringify(r.metadata) : ""),
        ].join(",") + "\n",
      );
    }
    res.end();

    await auditLog({
      orgId,
      actorId: req.actor!.actorId,
      action: "data.export.completed",
      resourceType: "audit_log",
      ip: req.ip,
      userAgent: req.get("user-agent"),
      metadata: { rowCount: rows.length, format: "csv" },
    });
  } catch (err) {
    logger.error({ err }, "Failed to export audit events");
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/admin/audit
 * Internal endpoint that lets first-party services append audit rows.
 * Production deployments should call `auditLog()` in-process instead;
 * this is here so the marketing/platform artifacts can record events
 * (e.g. login failures) until they are merged into the api-server.
 */
router.post("/admin/audit", writeLimiter, requireActor, async (req, res) => {
  const { action, resourceType, resourceId, metadata } = req.body ?? {};
  if (typeof action !== "string" || action.length === 0 || action.length > 200) {
    return res.status(400).json({ error: "Invalid action" });
  }
  await auditLog({
    orgId: req.actor!.orgId,
    actorId: req.actor!.actorId,
    actorType: "user",
    action,
    resourceType: typeof resourceType === "string" ? resourceType : null,
    resourceId: typeof resourceId === "string" ? resourceId : null,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    metadata: metadata && typeof metadata === "object" ? metadata : null,
  });
  return res.status(202).json({ ok: true });
});

function csv(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default router;

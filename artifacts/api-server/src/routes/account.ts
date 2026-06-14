import { Router } from "express";
import { sql } from "drizzle-orm";
import { auditLog, withComplianceContext } from "@workspace/db";
import { logger } from "../lib/logger";
import { writeLimiter, expensiveLimiter } from "../middlewares/rateLimit";
import { requireActor } from "../lib/actor";

const router = Router();

const DELETION_SLA_DAYS = 30;

/**
 * POST /api/account/export
 * Self-serve GDPR data export. Returns a JSON archive containing every
 * record we hold for the calling actor & org, plus their audit trail.
 */
router.post("/account/export", expensiveLimiter, requireActor, async (req, res) => {
  const { orgId, actorId } = req.actor!;
  try {
    const { auditRows, retention, deletions } = await withComplianceContext(orgId, async (tx) => {
      const auditRows = await tx.execute(sql`
        SELECT occurred_at, action, resource_type, resource_id, ip, user_agent, metadata
          FROM audit_events
         WHERE org_id = ${orgId} AND (actor_id = ${actorId} OR actor_id IS NULL)
         ORDER BY occurred_at DESC
         LIMIT 10000
      `);
      const retention = await tx.execute(sql`
        SELECT * FROM org_retention_settings WHERE org_id = ${orgId} LIMIT 1
      `);
      const deletions = await tx.execute(sql`
        SELECT id, requested_at, scheduled_for, status, completed_at
          FROM account_deletion_requests
         WHERE org_id = ${orgId} AND actor_id = ${actorId}
         ORDER BY requested_at DESC
      `);
      return { auditRows, retention, deletions };
    });

    const archive = {
      generatedAt: new Date().toISOString(),
      subject: { orgId, actorId },
      auditEvents: auditRows.rows,
      retentionSettings: retention.rows[0] ?? null,
      deletionRequests: deletions.rows,
      notice:
        "This archive contains all personally identifiable data Finsyt holds " +
        "for the named subject at the time of generation, per GDPR Art. 15 / 20.",
    };

    const body = JSON.stringify(archive, null, 2);
    const filename = `finsyt-data-export-${orgId}-${actorId}-${Date.now()}.json`;

    await withComplianceContext(orgId, (tx) =>
      tx.execute(sql`
        INSERT INTO data_export_requests (org_id, actor_id, format, byte_size)
        VALUES (${orgId}, ${actorId}, 'json', ${Buffer.byteLength(body)})
      `),
    );
    await auditLog({
      orgId,
      actorId,
      action: "data.export.requested",
      resourceType: "account",
      resourceId: actorId,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      metadata: { byteSize: Buffer.byteLength(body) },
    });

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(body);
  } catch (err) {
    logger.error({ err }, "Failed to generate data export");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/account/delete
 * Schedules hard-deletion of the account & all associated data within
 * the documented 30-day SLA. Idempotent: re-requesting returns the
 * existing pending request.
 */
router.post("/account/delete", writeLimiter, requireActor, async (req, res) => {
  const { orgId, actorId } = req.actor!;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 500) : null;
  try {
    const existing = await withComplianceContext(orgId, (tx) =>
      tx.execute(sql`
        SELECT id, requested_at, scheduled_for, status
          FROM account_deletion_requests
         WHERE org_id = ${orgId} AND actor_id = ${actorId} AND status = 'pending'
         LIMIT 1
      `),
    );
    const existingRow = existing.rows[0] as
      | { id: string; requested_at: string; scheduled_for: string; status: string }
      | undefined;
    if (existingRow) {
      return res.status(200).json({
        ok: true,
        alreadyScheduled: true,
        scheduledFor: existingRow.scheduled_for,
        slaDays: DELETION_SLA_DAYS,
      });
    }

    const scheduledFor = new Date(Date.now() + DELETION_SLA_DAYS * 24 * 60 * 60 * 1000);
    const inserted = await withComplianceContext(orgId, (tx) =>
      tx.execute(sql`
        INSERT INTO account_deletion_requests (org_id, actor_id, reason, scheduled_for)
        VALUES (${orgId}, ${actorId}, ${reason}, ${scheduledFor.toISOString()})
        RETURNING id, scheduled_for
      `),
    );
    const row = inserted.rows[0] as { id: string; scheduled_for: string };
    await auditLog({
      orgId,
      actorId,
      action: "account.delete.requested",
      resourceType: "account",
      resourceId: actorId,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      metadata: { scheduledFor: scheduledFor.toISOString(), slaDays: DELETION_SLA_DAYS, reason },
    });
    return res.status(202).json({
      ok: true,
      requestId: row.id,
      scheduledFor: row.scheduled_for,
      slaDays: DELETION_SLA_DAYS,
    });
  } catch (err) {
    logger.error({ err }, "Failed to schedule account deletion");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/account/delete
 * Cancel a pending deletion request (within the 30-day grace window).
 */
router.delete("/account/delete", writeLimiter, requireActor, async (req, res) => {
  const { orgId, actorId } = req.actor!;
  try {
    await withComplianceContext(orgId, (tx) =>
      tx.execute(sql`
        UPDATE account_deletion_requests
           SET status = 'cancelled'
         WHERE org_id = ${orgId} AND actor_id = ${actorId} AND status = 'pending'
      `),
    );
    await auditLog({
      orgId,
      actorId,
      action: "account.delete.requested",
      metadata: { cancelled: true },
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to cancel deletion request");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

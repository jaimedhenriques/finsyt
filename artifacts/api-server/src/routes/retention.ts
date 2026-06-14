import { Router } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { auditLog, purgeAuditEvents, withComplianceContext } from "@workspace/db";
import { logger } from "../lib/logger";
import { writeLimiter, expensiveLimiter } from "../middlewares/rateLimit";
import { requireOwner } from "../lib/actor";

const router = Router();

const retentionSchema = z.object({
  auditLogDays: z.coerce.number().int().min(0).max(3650),
  transientLogDays: z.coerce.number().int().min(0).max(3650),
  abandonedChatDays: z.coerce.number().int().min(0).max(3650),
});

router.get("/admin/retention", requireOwner, async (req, res) => {
  const orgId = req.actor!.orgId;
  try {
    const r = await withComplianceContext(orgId, (tx) =>
      tx.execute(sql`
        SELECT org_id, audit_log_days, transient_log_days, abandoned_chat_days, updated_at
          FROM org_retention_settings
         WHERE org_id = ${orgId}
         LIMIT 1
      `),
    );
    const row = r.rows[0] as Record<string, unknown> | undefined;
    return res.json({
      settings: row ?? {
        org_id: orgId,
        audit_log_days: 365,
        transient_log_days: 30,
        abandoned_chat_days: 90,
        updated_at: null,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to load retention settings");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/retention", writeLimiter, requireOwner, async (req, res) => {
  const parsed = retentionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }
  const orgId = req.actor!.orgId;
  const { auditLogDays, transientLogDays, abandonedChatDays } = parsed.data;
  try {
    await withComplianceContext(orgId, (tx) =>
      tx.execute(sql`
        INSERT INTO org_retention_settings (org_id, audit_log_days, transient_log_days, abandoned_chat_days, updated_at)
        VALUES (${orgId}, ${auditLogDays}, ${transientLogDays}, ${abandonedChatDays}, now())
        ON CONFLICT (org_id) DO UPDATE SET
          audit_log_days = EXCLUDED.audit_log_days,
          transient_log_days = EXCLUDED.transient_log_days,
          abandoned_chat_days = EXCLUDED.abandoned_chat_days,
          updated_at = now()
      `),
    );
    await auditLog({
      orgId,
      actorId: req.actor!.actorId,
      action: "retention.settings.updated",
      ip: req.ip,
      userAgent: req.get("user-agent"),
      metadata: parsed.data,
    });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to save retention settings");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/admin/retention/purge
 * Manually triggers the same purge the scheduled job runs nightly.
 * Owner-only, expensive bucket.
 */
router.post("/admin/retention/purge", expensiveLimiter, requireOwner, async (req, res) => {
  const orgId = req.actor!.orgId;
  try {
    const r = await withComplianceContext(orgId, (tx) =>
      tx.execute(sql`
        SELECT audit_log_days FROM org_retention_settings WHERE org_id = ${orgId} LIMIT 1
      `),
    );
    const row = r.rows[0] as { audit_log_days?: number } | undefined;
    const days = row?.audit_log_days ?? 365;
    const removed = await purgeAuditEvents(orgId, days);
    await auditLog({
      orgId,
      actorId: req.actor!.actorId,
      actorType: "user",
      action: "retention.purge.ran",
      ip: req.ip,
      userAgent: req.get("user-agent"),
      metadata: { auditEventsRemoved: removed, retainDays: days },
    });
    return res.json({ ok: true, auditEventsRemoved: removed });
  } catch (err) {
    logger.error({ err }, "Retention purge failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

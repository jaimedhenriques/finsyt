import { Router } from "express";
import {
  SYSTEM_ORG_ID,
  insertLeadSchema,
  leadsTable,
  withOrgContext,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { writeLimiter } from "../middlewares/rateLimit";

const router = Router();

// Marketing lead capture is intentionally public (visitors aren't
// authenticated yet). We attribute these leads to the dedicated SYSTEM_ORG_ID
// so they still satisfy the row-level security policy on `leads` — RLS will
// reject the insert at the database layer if anything tries to bypass this.
router.post("/leads", writeLimiter, async (req, res) => {
  const parsed = insertLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  try {
    const [lead] = await withOrgContext(SYSTEM_ORG_ID, (tx) =>
      tx
        .insert(leadsTable)
        .values({ ...parsed.data, orgId: SYSTEM_ORG_ID })
        .returning(),
    );
    logger.info({ leadId: lead.id }, "New lead captured");
    return res.status(201).json({ id: lead.id });
  } catch (err) {
    logger.error({ err }, "Failed to insert lead");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

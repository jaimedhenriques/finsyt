import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrgContext, researchNotesTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { writeLimiter } from "../middlewares/rateLimit";
import { requireAuth, requireOrgRole } from "../middlewares/requireAuth";
import { csrfProtection } from "../middlewares/csrf";

const router = Router();

const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(50_000).default(""),
});

router.get("/research/notes", requireAuth, requireOrgRole("viewer"), async (req, res, next) => {
  try {
    const orgId = req.orgContext!.orgId!;
    // Defense-in-depth: explicit org_id filter mirrors the RLS tenant-isolation
    // policy so cross-tenant reads are blocked at the query level even if the
    // connection role bypasses RLS.
    const rows = await withOrgContext(orgId, (tx) =>
      tx
        .select()
        .from(researchNotesTable)
        .where(eq(researchNotesTable.orgId, orgId))
        .orderBy(researchNotesTable.createdAt),
    );
    res.json({ notes: rows });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/research/notes",
  writeLimiter,
  requireAuth,
  csrfProtection(),
  requireOrgRole("member"),
  async (req, res, next) => {
    const parsed = createNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }
    try {
      const orgId = req.orgContext!.orgId!;
      const userId = req.userId!;
      const [note] = await withOrgContext(orgId, (tx) =>
        tx
          .insert(researchNotesTable)
          .values({
            orgId,
            authorUserId: userId,
            title: parsed.data.title,
            body: parsed.data.body,
          })
          .returning(),
      );
      logger.info({ noteId: note.id, orgId }, "Research note created");
      res.status(201).json({ note });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/research/notes/:id",
  requireAuth,
  csrfProtection(),
  requireOrgRole("admin"),
  async (req, res, next) => {
    try {
      const orgId = req.orgContext!.orgId!;
      const id = String(req.params.id);
      // Defense-in-depth: scope the delete to (org_id, id) so a privileged
      // connection cannot delete another tenant's note by bare UUID.
      const deleted = await withOrgContext(orgId, (tx) =>
        tx
          .delete(researchNotesTable)
          .where(and(eq(researchNotesTable.id, id), eq(researchNotesTable.orgId, orgId)))
          .returning(),
      );
      if (deleted.length === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export default router;

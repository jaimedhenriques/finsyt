import { pgTable, text, uuid, timestamp, index, jsonb, boolean } from "drizzle-orm/pg-core";
import { z } from "zod";
import { organizationsTable } from "./tenancy";

export const researchNotesTable = pgTable(
  "research_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("research_notes_org_id_idx").on(t.orgId),
  }),
);

export const insertResearchNoteSchema = z.object({
  authorUserId: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  body: z.string().max(50_000).optional(),
});
export type InsertResearchNote = z.infer<typeof insertResearchNoteSchema>;
export type ResearchNote = typeof researchNotesTable.$inferSelect;

export const chatMessagesTable = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull(),
    threadId: uuid("thread_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrgThread: index("chat_messages_org_thread_idx").on(t.orgId, t.threadId),
  }),
);

export type ChatMessage = typeof chatMessagesTable.$inferSelect;

// ── Screener presets ─────────────────────────────────────────────────────────
// Persisted Screener filter combinations, scoped by Clerk org id (text — Clerk
// owns the source of truth for organisations, so we don't FK to the local
// organisations table). A preset is owned by the analyst who created it
// (`authorUserId`); flipping `shared` to true publishes it to teammates in the
// same org. Filters are stored as opaque JSON so the Screener UI can evolve
// its filter schema without forcing a DB migration.
export const screenerPresetsTable = pgTable(
  "screener_presets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    authorUserId: text("author_user_id").notNull(),
    name: text("name").notNull(),
    filters: jsonb("filters").notNull(),
    shared: boolean("shared").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("screener_presets_org_idx").on(t.orgId),
    byOrgAuthor: index("screener_presets_org_author_idx").on(t.orgId, t.authorUserId),
  }),
);

export type ScreenerPresetRow = typeof screenerPresetsTable.$inferSelect;
export type InsertScreenerPreset = typeof screenerPresetsTable.$inferInsert;

export const screenerPresetInputSchema = z.object({
  name: z.string().min(1).max(60),
  filters: z.record(z.unknown()),
  shared: z.boolean().optional(),
});
export type ScreenerPresetInput = z.infer<typeof screenerPresetInputSchema>;

export const screenerPresetPatchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  filters: z.record(z.unknown()).optional(),
  shared: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });
export type ScreenerPresetPatch = z.infer<typeof screenerPresetPatchSchema>;

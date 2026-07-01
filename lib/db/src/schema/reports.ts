import { pgTable, text, uuid, timestamp, index, integer, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod";

// ── Reports ─────────────────────────────────────────────────────────────────
// Workspace-scoped research reports / tearsheets that analysts compose from
// reusable blocks (KPI table, chart, peer comparison, valuation, commentary,
// citations) and export to PPTX / PDF. Keyed by Clerk org id (text) like
// peer_sets and agents: visible to every member of the workspace, but only the
// author can edit or delete (mirrored in the RLS policies in `rls-sql.ts`).

export const reportsTable = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    authorUserId: text("author_user_id").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    symbol: text("symbol").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("reports_org_idx").on(t.orgId),
    byOrgUpdated: index("reports_org_updated_idx").on(t.orgId, t.updatedAt),
  }),
);

export type ReportRow = typeof reportsTable.$inferSelect;
export type InsertReportRow = typeof reportsTable.$inferInsert;

// ── Report blocks ─────────────────────────────────────────────────────────────
// One row per ordered block inside a report. `position` preserves the canvas
// order the analyst arranged; `config` is the per-block JSON (symbol overrides,
// metric selection, commentary text, etc.). Cascade-deletes with the parent.

export const reportBlocksTable = pgTable(
  "report_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reportsTable.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    kind: text("kind").notNull(),
    config: jsonb("config").notNull().default({}),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byReport: index("report_blocks_report_idx").on(t.reportId, t.position),
    byOrg: index("report_blocks_org_idx").on(t.orgId),
  }),
);

export type ReportBlockRow = typeof reportBlocksTable.$inferSelect;
export type InsertReportBlockRow = typeof reportBlocksTable.$inferInsert;

// ── Validation schemas ──────────────────────────────────────────────────────
export const REPORT_BLOCK_KINDS = [
  "kpi",
  "chart",
  "peers",
  "valuation",
  "text",
  "citations",
] as const;
export type ReportBlockKind = (typeof REPORT_BLOCK_KINDS)[number];

const SYMBOL_RE = /^[A-Z0-9.\-]{1,15}$/;
const symbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((s) => s === "" || SYMBOL_RE.test(s), { message: "Invalid ticker symbol" });

// Per-block config is a free-form JSON object; the renderers / assemblers read
// the fields they understand. Cap the serialized size so a single block can't
// bloat a report row.
export const reportBlockConfigSchema = z
  .record(z.string(), z.unknown())
  .refine((v) => JSON.stringify(v).length <= 8000, { message: "block config too large" });

export const reportBlockInputSchema = z.object({
  kind: z.enum(REPORT_BLOCK_KINDS),
  config: reportBlockConfigSchema.optional().default({}),
});
export type ReportBlockInput = z.infer<typeof reportBlockInputSchema>;

export const reportInputSchema = z.object({
  title: z.string().trim().min(1).max(140),
  subtitle: z.string().max(280).optional().default(""),
  symbol: symbolSchema.optional().default(""),
  blocks: z.array(reportBlockInputSchema).max(40).optional().default([]),
});
export type ReportInput = z.infer<typeof reportInputSchema>;

export const reportPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(140).optional(),
    subtitle: z.string().max(280).optional(),
    symbol: symbolSchema.optional(),
    blocks: z.array(reportBlockInputSchema).max(40).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });
export type ReportPatch = z.infer<typeof reportPatchSchema>;

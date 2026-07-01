import { pgTable, text, uuid, timestamp, index, integer, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod";
import { organizationsTable } from "./tenancy";

// ── Financial Statement Templates ───────────────────────────────────────────
// Org-scoped persisted templates for the company Financials tab.
// Each template defines which line items to display, their order/grouping,
// any calculated rows, and the preferred period layout.
// Built-in templates (banker-summary, margins-focused, etc.) are stored
// client-side only; only user-created templates are persisted here.

export const STATEMENT_TYPES = ["income", "balance", "cashflow"] as const;
export type StatementType = (typeof STATEMENT_TYPES)[number];

export const PRESENTATION_TYPES = ["standardized", "as-reported"] as const;
export type PresentationType = (typeof PRESENTATION_TYPES)[number];

export const LINE_ITEM_TYPES = ["field", "calculated", "header", "spacer"] as const;
export type LineItemType = (typeof LINE_ITEM_TYPES)[number];

export const financialTemplatesTable = pgTable(
  "financial_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    statementType: text("statement_type").notNull().default("income"),
    presentation: text("presentation").notNull().default("standardized"),
    periodLayout: text("period_layout").notNull().default("annual"),
    numPeriods: integer("num_periods").notNull().default(5),
    /** Ordered array of line item definitions */
    lineItems: jsonb("line_items").notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("financial_templates_org_idx").on(t.orgId),
  }),
);

export type FinancialTemplateRow = typeof financialTemplatesTable.$inferSelect;
export type InsertFinancialTemplateRow = typeof financialTemplatesTable.$inferInsert;

// ── Zod schemas ──────────────────────────────────────────────────────────────

export const lineItemSchema = z.object({
  id: z.string().min(1).max(60),
  type: z.enum(LINE_ITEM_TYPES),
  label: z.string().max(120),
  /** Provider field key (for type='field') */
  key: z.string().max(120).optional(),
  /** Simple formula "fieldA / fieldB" or "fieldA - fieldB" (for type='calculated') */
  formula: z.string().max(500).optional(),
  operandA: z.string().max(120).optional(),
  operandB: z.string().max(120).optional(),
  operator: z.enum(["/", "-", "+", "*"]).optional(),
  isPercent: z.boolean().optional(),
  isCurrency: z.boolean().optional(),
  isBold: z.boolean().optional(),
});

export type LineItemDef = z.infer<typeof lineItemSchema>;

export const insertFinancialTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  statementType: z.enum(STATEMENT_TYPES),
  presentation: z.enum(PRESENTATION_TYPES).optional(),
  periodLayout: z.enum(["annual", "quarterly", "ltm"]).optional(),
  numPeriods: z.number().int().min(1).max(20).optional(),
  lineItems: z.array(lineItemSchema).max(100),
});
export type InsertFinancialTemplateInput = z.infer<typeof insertFinancialTemplateSchema>;

export const patchFinancialTemplateSchema = insertFinancialTemplateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });
export type PatchFinancialTemplateInput = z.infer<typeof patchFinancialTemplateSchema>;

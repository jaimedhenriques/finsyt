import {
  pgTable, text, uuid, timestamp, index, integer, numeric, jsonb, uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { organizationsTable } from "./tenancy";

// ── Private company financials ───────────────────────────────────────────────
// Structured income / balance / cash-flow statements for private targets.
// Sourced from data-room uploads, manual entry, or a future financials provider.
// Each row is one statement period for one company, scoped to the org that
// entered the data.
//
// `coresignal_id` links back to the CoreSignal company record (numeric string).
// `source` distinguishes manual entry ("manual"), data-room ingest ("data_room"),
//   and a future structured-data provider ("provider").
// `period` is ISO date of the period end (e.g. "2024-12-31").
// `period_type` is "annual" or "quarterly".
// `statement` is "income" | "balance" | "cashflow".
// `data` is a JSONB blob with the line-item values — same shape as the public
//   company financials so the same rendering component can be reused.

export const privateFinancialsTable = pgTable(
  "private_financials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    coresignalId: text("coresignal_id").notNull(),
    companyName: text("company_name").notNull().default(""),
    statement: text("statement").notNull(),
    periodType: text("period_type").notNull().default("annual"),
    period: text("period").notNull(),
    source: text("source").notNull().default("manual"),
    sourceLabel: text("source_label"),
    currency: text("currency").notNull().default("USD"),
    data: jsonb("data").notNull().default({}),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("private_financials_org_idx").on(t.orgId),
    byOrgCompany: index("private_financials_org_company_idx").on(t.orgId, t.coresignalId),
    uniqPeriod: uniqueIndex("private_financials_uniq_period").on(
      t.orgId, t.coresignalId, t.statement, t.period, t.periodType,
    ),
  }),
);

export type PrivateFinancialRow = typeof privateFinancialsTable.$inferSelect;
export type InsertPrivateFinancialRow = typeof privateFinancialsTable.$inferInsert;

export const insertPrivateFinancialSchema = z.object({
  coresignalId: z.string().min(1).max(40),
  companyName: z.string().max(200).optional(),
  statement: z.enum(["income", "balance", "cashflow"]),
  periodType: z.enum(["annual", "quarterly"]).optional(),
  period: z.string().min(4).max(10),
  source: z.enum(["manual", "data_room", "provider"]).optional(),
  sourceLabel: z.string().max(80).optional(),
  currency: z.string().max(3).optional(),
  data: z.record(z.unknown()),
  notes: z.string().max(500).optional(),
});

// ── Private company cap table ────────────────────────────────────────────────
// One entry per shareholder / share class, org-scoped.
// `entryType` distinguishes:
//   "shareholder"  — an individual or fund holding shares
//   "share_class"  — a class definition (Common A, Preferred B, SAFE, etc.)
//   "option_pool"  — reserved employee option pool
// `round`         — funding round the shares were issued at (e.g. "Series B")
// `shares`        — number of shares (nullable for percentage-only entries)
// `ownershipPct`  — ownership percentage (can be entered directly or computed)
// `liquidationPref` — liquidation preference multiplier for preferred (e.g. 1.0)
// `data`          — any extra fields (anti-dilution, board seat, etc.)

export const privateCapTableTable = pgTable(
  "private_cap_table",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    coresignalId: text("coresignal_id").notNull(),
    companyName: text("company_name").notNull().default(""),
    entryType: text("entry_type").notNull().default("shareholder"),
    name: text("name").notNull(),
    shareClass: text("share_class"),
    round: text("round"),
    shares: numeric("shares", { precision: 20, scale: 0 }),
    ownershipPct: numeric("ownership_pct", { precision: 8, scale: 4 }),
    liquidationPref: numeric("liquidation_pref", { precision: 6, scale: 2 }),
    boardSeat: text("board_seat"),
    position: integer("position").notNull().default(0),
    data: jsonb("data").notNull().default({}),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("private_cap_table_org_idx").on(t.orgId),
    byOrgCompany: index("private_cap_table_org_company_idx").on(t.orgId, t.coresignalId),
  }),
);

export type PrivateCapTableRow = typeof privateCapTableTable.$inferSelect;
export type InsertPrivateCapTableRow = typeof privateCapTableTable.$inferInsert;

export const insertCapTableEntrySchema = z.object({
  coresignalId: z.string().min(1).max(40),
  companyName: z.string().max(200).optional(),
  entryType: z.enum(["shareholder", "share_class", "option_pool"]).optional(),
  name: z.string().min(1).max(200),
  shareClass: z.string().max(80).optional(),
  round: z.string().max(40).optional(),
  shares: z.string().max(30).optional(),
  ownershipPct: z.string().max(12).optional(),
  liquidationPref: z.string().max(8).optional(),
  boardSeat: z.string().max(100).optional(),
  position: z.number().int().min(0).max(10000).optional(),
  data: z.record(z.unknown()).optional(),
  notes: z.string().max(500).optional(),
});

export const patchCapTableEntrySchema = insertCapTableEntrySchema
  .partial()
  .omit({ coresignalId: true, companyName: true })
  .refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });

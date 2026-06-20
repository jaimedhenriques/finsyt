import { pgTable, text, uuid, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod";

// ── Factor strategies ────────────────────────────────────────────────────────
// Saved Factor Lab back-test definitions. Workspace-scoped reusable strategies
// (factor + universe + rebalance + quantiles + date range) that analysts name
// and re-run. Keyed by Clerk org id (text) like peer_sets and agents: visible
// to every member of the workspace, only the author can edit or delete
// (mirrored in the RLS policies in `rls-sql.ts`). The strategy parameters are
// stored as a validated JSON blob so the schema does not have to change every
// time the engine gains a knob.

export const factorStrategiesTable = pgTable(
  "factor_strategies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    authorUserId: text("author_user_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    config: jsonb("config").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("factor_strategies_org_idx").on(t.orgId),
    byOrgName: index("factor_strategies_org_name_idx").on(t.orgId, t.name),
  }),
);

export type FactorStrategyRow = typeof factorStrategiesTable.$inferSelect;
export type InsertFactorStrategyRow = typeof factorStrategiesTable.$inferInsert;

// ── Validation schemas ──────────────────────────────────────────────────────
const SYMBOL_RE = /^[A-Z0-9.\-]{1,15}$/;
const symbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((s) => SYMBOL_RE.test(s), { message: "Invalid ticker symbol" });

export const factorConfigSchema = z.object({
  factor: z.enum(["mom_12_1", "mom_6_1", "lowvol_3m", "reversal_1m", "trend_52w"]),
  quantiles: z.number().int().min(2).max(10),
  rebalance: z.enum(["monthly", "quarterly", "semiannual", "annual"]),
  years: z.number().int().min(1).max(10),
  benchmark: symbolSchema.default("SPY"),
  universeKey: z.string().trim().min(1).max(40).optional(),
  symbols: z.array(symbolSchema).min(2).max(60).optional(),
});
export type FactorConfig = z.infer<typeof factorConfigSchema>;

export const factorStrategyInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(280).optional().default(""),
  config: factorConfigSchema,
});
export type FactorStrategyInput = z.infer<typeof factorStrategyInputSchema>;

export const factorStrategyPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().max(280).optional(),
    config: factorConfigSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });
export type FactorStrategyPatch = z.infer<typeof factorStrategyPatchSchema>;

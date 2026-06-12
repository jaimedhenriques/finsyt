import { pgTable, text, uuid, timestamp, index, real, integer } from "drizzle-orm/pg-core";
import { z } from "zod";
import { organizationsTable } from "./tenancy";

// ── Portfolio positions ──────────────────────────────────────────────────────
// Workspace-scoped (UUID FK to organizations.id, like research_notes), so use
// `withOrgContext(localUuid)` after `resolveLocalOrgId(clerkOrgId)`.
// Each row is a single lot — symbol + shares + cost basis + open date. Cash
// drag, dividends and realised P&L are derived elsewhere from quotes.
export const portfolioPositionsTable = pgTable(
  "portfolio_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull(),
    symbol: text("symbol").notNull(),
    shares: real("shares").notNull(),
    costBasis: real("cost_basis").notNull(),
    openedAt: timestamp("opened_at").defaultNow().notNull(),
    sector: text("sector"),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("portfolio_positions_org_idx").on(t.orgId),
    byOrgSymbol: index("portfolio_positions_org_symbol_idx").on(t.orgId, t.symbol),
  }),
);

export type PortfolioPosition = typeof portfolioPositionsTable.$inferSelect;
export type InsertPortfolioPosition = typeof portfolioPositionsTable.$inferInsert;

export const insertPortfolioPositionSchema = z.object({
  symbol: z.string().min(1).max(12).regex(/^[A-Z0-9][A-Z0-9.\-]{0,11}$/),
  shares: z.number().finite().positive().max(1e9),
  costBasis: z.number().finite().positive().max(1e7),
  openedAt: z.string().datetime().optional(),
  sector: z.string().max(80).optional(),
  note: z.string().max(2000).optional(),
});

export const patchPortfolioPositionSchema = z.object({
  shares: z.number().finite().positive().max(1e9).optional(),
  costBasis: z.number().finite().positive().max(1e7).optional(),
  openedAt: z.string().datetime().optional(),
  sector: z.string().max(80).optional(),
  note: z.string().max(2000).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });

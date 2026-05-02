import { pgTable, text, real, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod";

// ── Workspace deck overrides ─────────────────────────────────────────────────
// Per-workspace pinned overrides for the banker-pitch deck export. One row
// per Clerk org id — every analyst on the deal team sees the same saved
// configuration, so refreshing a pitch next week doesn't require re-typing
// the team's WACC / terminal-growth assumptions or re-picking the peer set.
//
// Keyed by Clerk org id (text) like `peer_sets` / `screener_presets`, with
// matching RLS policies in `rls-sql.ts` that read
// `app.current_clerk_org_id` and `app.current_clerk_user_id`. All fields
// except `orgId` and `updatedByUserId` are nullable so leaving any input
// blank in the UI persists as "fall back to platform defaults".
//
// Decimal fractions are stored in the same units the deck route expects
// (e.g. `wacc = 0.09` for 9%, `terminalGrowth = 0.025` for 2.5%).

export const deckOverridesTable = pgTable("deck_overrides", {
  orgId: text("org_id").primaryKey(),
  /** Optional FK to peer_sets.id; not declared as a hard FK so the row
   * survives a peer set being renamed/deleted (the resolver in the deck
   * route already tolerates a stale id by falling back to defaults). */
  peerSetId: uuid("peer_set_id"),
  wacc: real("wacc"),
  terminalGrowth: real("terminal_growth"),
  growthStage1: real("growth_stage1"),
  growthStage2: real("growth_stage2"),
  /** Last analyst who saved the configuration — surfaced in the UI so the
   * team knows whose assumptions are currently pinned. */
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type DeckOverridesRow = typeof deckOverridesTable.$inferSelect;
export type InsertDeckOverridesRow = typeof deckOverridesTable.$inferInsert;

// ── Validation ──────────────────────────────────────────────────────────────
// All numeric ranges mirror the clamp ranges enforced by /api/copilot/deck so
// the UI cannot persist a value the export route would silently drop.
const optionalUuid = z.string().uuid().nullable().optional();
const optionalDecimal = (lo: number, hi: number) =>
  z
    .number()
    .min(lo)
    .max(hi)
    .nullable()
    .optional();

export const deckOverridesPutSchema = z.object({
  peerSetId: optionalUuid,
  wacc: optionalDecimal(0.01, 0.40),
  terminalGrowth: optionalDecimal(0.0, 0.10),
  growthStage1: optionalDecimal(-0.20, 0.50),
  growthStage2: optionalDecimal(-0.20, 0.30),
});
export type DeckOverridesPut = z.infer<typeof deckOverridesPutSchema>;

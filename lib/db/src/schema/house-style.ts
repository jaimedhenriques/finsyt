import { pgTable, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

// ── Org-level house-style configuration ──────────────────────────────────────
//
// One row per Clerk org id (text), matching the pattern used by
// `deck_overrides` / `live_highlights_settings` / `blueprints`. RLS policies
// live in `rls-sql.ts` and read `app.current_clerk_org_id`, so callers must
// enter `withClerkContext(orgId, userId, …)` / `withComplianceContext(orgId, …)`
// for every read or write.
//
// The physical table is also created by an idempotent CREATE TABLE bootstrap in
// `house-style-bootstrap.ts` so a fresh database self-heals on boot without a
// `drizzle-kit push` step (mirrors the deck-overrides / blueprint pattern).
//
// `config` is a single JSONB blob holding the brand palette, fonts, number
// formatting rules, preferred terminology, and reusable prompts. Keeping it as
// one document (rather than columns) lets the house-style schema evolve without
// a migration each time a new style knob is added — the platform validates the
// shape in `artifacts/platform/lib/house-style.ts`.

export const houseStyleTable = pgTable("house_style", {
  orgId: text("org_id").primaryKey(),
  /** Master switch — when false, generators ignore the saved config and use
   * Finsyt platform defaults. */
  enabled: boolean("enabled").notNull().default(true),
  /** The full house-style document. Shape validated in the platform lib. */
  config: jsonb("config").notNull().default({}),
  /** Last analyst who saved the configuration — surfaced in the UI. */
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type HouseStyleRow = typeof houseStyleTable.$inferSelect;
export type InsertHouseStyleRow = typeof houseStyleTable.$inferInsert;

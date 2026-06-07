import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

// ── User preferences ─────────────────────────────────────────────────────────
// Per-user account settings that should follow the analyst across browsers
// and devices. Keyed on the Clerk user id (text — Clerk owns identity), so
// no FK to the local `organizations` table. Currently stores the agent
// answer transparency toggles surfaced under Settings → Appearance, but is
// shaped to absorb future per-user preferences (e.g. density, currency,
// date format) without another migration.
//
// Defense-in-depth: RLS policies on this table (see rls-sql.ts) restrict
// every read/write to the row whose `user_id` matches the
// `app.current_clerk_user_id` GUC bound by `withClerkUserContext`.
export const userPreferencesTable = pgTable("user_preferences", {
  userId: text("user_id").primaryKey(),
  dataSourcesFooterEnabled: boolean("data_sources_footer_enabled").notNull().default(true),
  dataSourcesFooterCollapsed: boolean("data_sources_footer_collapsed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserPreferencesRow = typeof userPreferencesTable.$inferSelect;
export type InsertUserPreferences = typeof userPreferencesTable.$inferInsert;

// PATCH body for /api/user/preferences. Both fields are optional because the
// UI submits them independently — the route merges them onto the existing row
// (or seeds a new one with defaults).
export const userPreferencesPatchSchema = z
  .object({
    dataSourcesFooterEnabled: z.boolean().optional(),
    dataSourcesFooterCollapsed: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });
export type UserPreferencesPatch = z.infer<typeof userPreferencesPatchSchema>;

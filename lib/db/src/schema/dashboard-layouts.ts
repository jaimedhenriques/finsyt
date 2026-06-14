import { pgTable, text, uuid, jsonb, timestamp, index, unique } from "drizzle-orm/pg-core";
import { z } from "zod";
import { organizationsTable } from "./tenancy";

// ── Customizable widget dashboard layouts ───────────────────────────────────
// Per-user, per-org layout for the platform Overview (and any future widget
// board). `org_id` is a UUID FK to organizations.id (like alerts /
// research_notes); rows are RLS-isolated via `withOrgContext(localUuid)` and
// further scoped to a single analyst through the `user_id` (Clerk user id)
// column in every route query. `widgets` is an ordered, free-form blob so the
// client widget schema can evolve without a DB migration. One row per
// (org, user, page).

export interface PlacedWidgetData {
  id: string;
  widgetId: string;
  order: number;
  w?: number;
  config?: Record<string, unknown>;
}

export const dashboardLayoutsTable = pgTable(
  "dashboard_layouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    page: text("page").notNull().default("/app"),
    widgets: jsonb("widgets").$type<PlacedWidgetData[]>().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrgUser: index("dashboard_layouts_org_user_idx").on(t.orgId, t.userId),
    uniqOrgUserPage: unique("dashboard_layouts_org_user_page_uq").on(
      t.orgId,
      t.userId,
      t.page,
    ),
  }),
);

export type DashboardLayoutRow = typeof dashboardLayoutsTable.$inferSelect;
export type InsertDashboardLayoutRow = typeof dashboardLayoutsTable.$inferInsert;

export const placedWidgetSchema = z.object({
  id: z.string().min(1).max(120),
  widgetId: z.string().min(1).max(60),
  order: z.number().int().min(0).max(999),
  w: z.number().int().min(1).max(4).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type PlacedWidgetInput = z.infer<typeof placedWidgetSchema>;

export const putDashboardLayoutSchema = z.object({
  page: z.string().min(1).max(120).optional(),
  widgets: z.array(placedWidgetSchema).max(80),
});
export type PutDashboardLayoutInput = z.infer<typeof putDashboardLayoutSchema>;

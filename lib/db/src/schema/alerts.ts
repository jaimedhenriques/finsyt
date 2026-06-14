import { pgTable, text, uuid, timestamp, index, real, boolean } from "drizzle-orm/pg-core";
import { z } from "zod";
import { organizationsTable } from "./tenancy";

// ── Price / volume / news alerts ────────────────────────────────────────────
// Workspace-scoped (UUID FK to organizations.id, like research_notes /
// portfolio_positions). Use `withOrgContext(localUuid)` after
// `resolveLocalOrgId(clerkOrgId)` for every read/write so the
// `app.current_org_id` GUC is bound for RLS.

export const ALERT_TYPES = [
  "price_above",
  "price_below",
  "pct_change",
  "volume_spike",
  "news",
  "news_sentiment",
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const NOTIFY_CHANNELS = ["email", "none"] as const;
export type AlertNotifyChannel = (typeof NOTIFY_CHANNELS)[number];

export const alertsTable = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull().default(""),
    type: text("type").notNull(),
    threshold: real("threshold").notNull().default(0),
    currentVal: real("current_val").notNull().default(0),
    triggered: boolean("triggered").notNull().default(false),
    active: boolean("active").notNull().default(true),
    note: text("note"),
    notifyEnabled: boolean("notify_enabled").notNull().default(true),
    notifyChannel: text("notify_channel").notNull().default("email"),
    lastNotifiedAt: timestamp("last_notified_at"),
    lastCheckedAt: timestamp("last_checked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("alerts_org_idx").on(t.orgId),
    byOrgSymbol: index("alerts_org_symbol_idx").on(t.orgId, t.symbol),
  }),
);

export type AlertRow = typeof alertsTable.$inferSelect;
export type InsertAlertRow = typeof alertsTable.$inferInsert;

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/;

export const insertAlertSchema = z.object({
  symbol: z.string().min(1).max(12).regex(SYMBOL_RE),
  name: z.string().max(200).optional(),
  type: z.enum(ALERT_TYPES),
  threshold: z.number().finite().min(0).max(1e12).optional(),
  currentVal: z.number().finite().min(0).max(1e12).optional(),
  active: z.boolean().optional(),
  note: z.string().max(2000).optional(),
  notifyEnabled: z.boolean().optional(),
  notifyChannel: z.enum(NOTIFY_CHANNELS).optional(),
});
export type InsertAlertInput = z.infer<typeof insertAlertSchema>;

export const patchAlertSchema = z.object({
  name: z.string().max(200).optional(),
  threshold: z.number().finite().min(0).max(1e12).optional(),
  currentVal: z.number().finite().min(0).max(1e12).optional(),
  triggered: z.boolean().optional(),
  active: z.boolean().optional(),
  note: z.string().max(2000).nullable().optional(),
  notifyEnabled: z.boolean().optional(),
  notifyChannel: z.enum(NOTIFY_CHANNELS).optional(),
  lastNotifiedAt: z.string().datetime().nullable().optional(),
  lastCheckedAt: z.string().datetime().nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });
export type PatchAlertInput = z.infer<typeof patchAlertSchema>;

import { pgTable, text, uuid, timestamp, index, jsonb, boolean, integer } from "drizzle-orm/pg-core";
import { z } from "zod";
import { agentsTable } from "./agents";

// ── Agent Event Triggers ────────────────────────────────────────────────────
// An agent can be launched by:
//  - A schedule (existing: via agentsTable.schedule + cron)
//  - An event trigger (new): a condition evaluated periodically or on webhook
//
// triggerType options:
//   filing   — a new SEC filing matching formType / symbol filter
//   price    — price crosses a threshold (symbol + direction + level)
//   news     — a news article matches keyword(s) for a ticker
//   watchlist — any material move (>= thresholdPct in 24h) on watched tickers
//
// The `config` jsonb is typed per triggerType via Zod schemas below.
// `enabled` lets users pause/resume a trigger without deleting it.
// `lastFiredAt` is updated on each successful evaluation that fired the agent.
// `lastCheckedAt` tracks the last evaluation run (for debugging).
// `lastError` captures the most recent evaluation error string.

export const agentEventTriggersTable = pgTable(
  "agent_event_triggers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    triggerType: text("trigger_type").notNull(),
    config: jsonb("config").notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    lastFiredAt: timestamp("last_fired_at"),
    lastCheckedAt: timestamp("last_checked_at"),
    lastError: text("last_error"),
    fireCount: integer("fire_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("agent_event_triggers_org_idx").on(t.orgId),
    byAgent: index("agent_event_triggers_agent_idx").on(t.agentId),
    byOrgEnabled: index("agent_event_triggers_org_enabled_idx").on(t.orgId, t.enabled),
  }),
);

export type AgentEventTriggerRow = typeof agentEventTriggersTable.$inferSelect;
export type InsertAgentEventTriggerRow = typeof agentEventTriggersTable.$inferInsert;

// ── Zod schemas for trigger configs ────────────────────────────────────────

export const TRIGGER_TYPES = ["filing", "price", "news", "watchlist"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const filingTriggerConfigSchema = z.object({
  symbol: z.string().min(1).max(12).optional(),
  formType: z.string().max(20).optional(),
  cooldownHours: z.number().min(0).max(720).optional().default(24),
});
export type FilingTriggerConfig = z.infer<typeof filingTriggerConfigSchema>;

export const priceTriggerConfigSchema = z.object({
  symbol: z.string().min(1).max(12),
  direction: z.enum(["above", "below"]),
  threshold: z.number(),
  cooldownHours: z.number().min(0).max(720).optional().default(24),
});
export type PriceTriggerConfig = z.infer<typeof priceTriggerConfigSchema>;

export const newsTriggerConfigSchema = z.object({
  symbol: z.string().min(1).max(12).optional(),
  keywords: z.array(z.string().max(80)).min(1).max(20),
  cooldownHours: z.number().min(0).max(720).optional().default(12),
});
export type NewsTriggerConfig = z.infer<typeof newsTriggerConfigSchema>;

export const watchlistTriggerConfigSchema = z.object({
  symbols: z.array(z.string().max(12)).min(1).max(50),
  thresholdPct: z.number().min(0.1).max(100).optional().default(5),
  cooldownHours: z.number().min(0).max(720).optional().default(24),
});
export type WatchlistTriggerConfig = z.infer<typeof watchlistTriggerConfigSchema>;

export const triggerConfigSchema = z.union([
  filingTriggerConfigSchema,
  priceTriggerConfigSchema,
  newsTriggerConfigSchema,
  watchlistTriggerConfigSchema,
]);

export const insertAgentEventTriggerSchema = z.object({
  triggerType: z.enum(TRIGGER_TYPES),
  config: z.record(z.unknown()),
  enabled: z.boolean().optional().default(true),
});
export type InsertAgentEventTrigger = z.infer<typeof insertAgentEventTriggerSchema>;

import { pgTable, text, uuid, timestamp, index, jsonb, boolean, integer } from "drizzle-orm/pg-core";
import { z } from "zod";

// ── Agentic AI Workspace ────────────────────────────────────────────────────
// Workspace-scoped via Clerk org id (text), keyed exactly like screener_presets.
// Use `withClerkContext(orgId, userId, fn)` on every read/write so the parallel
// `app.current_clerk_org_id` GUC is bound and the RLS policies in `rls.sql`
// restrict rows to the caller's workspace.

export const agentsTable = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    authorUserId: text("author_user_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("Scheduled"),
    templateSlug: text("template_slug"),
    category: text("category").notNull(),
    icon: text("icon").notNull().default("◎"),
    schedule: jsonb("schedule").notNull(),
    instructions: text("instructions").notNull().default(""),
    lastRunAt: timestamp("last_run_at"),
    nextRunAt: timestamp("next_run_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("agents_org_idx").on(t.orgId),
    byOrgStatus: index("agents_org_status_idx").on(t.orgId, t.status),
    byNextRun: index("agents_next_run_idx").on(t.nextRunAt),
  }),
);

export type AgentRow = typeof agentsTable.$inferSelect;
export type InsertAgentRow = typeof agentsTable.$inferInsert;

export const agentRunsTable = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    agentName: text("agent_name").notNull(),
    category: text("category").notNull(),
    icon: text("icon").notNull().default("◎"),
    triggeredBy: text("triggered_by").notNull().default("manual"), // manual | scheduled
    triggeredByUserId: text("triggered_by_user_id"),
    ranAt: timestamp("ran_at").defaultNow().notNull(),
    read: boolean("read").notNull().default(false),
    headline: text("headline").notNull().default(""),
    summary: text("summary").notNull().default(""),
    findings: jsonb("findings").notNull().default([]),
    sources: jsonb("sources").notNull().default([]),
    model: text("model"),
    provider: text("provider"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    latencyMs: integer("latency_ms"),
    runStatus: text("run_status").notNull().default("ok"), // ok | error
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("agent_runs_org_idx").on(t.orgId),
    byOrgAgent: index("agent_runs_org_agent_idx").on(t.orgId, t.agentId),
    byOrgUnread: index("agent_runs_org_unread_idx").on(t.orgId, t.read),
    byOrgRanAt: index("agent_runs_org_ran_at_idx").on(t.orgId, t.ranAt),
  }),
);

export type AgentRunRow = typeof agentRunsTable.$inferSelect;
export type InsertAgentRunRow = typeof agentRunsTable.$inferInsert;

// ── Schedule Zod ────────────────────────────────────────────────────────────
export const FREQUENCIES = ["Daily", "Weekly", "Monthly", "Real-time"] as const;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const STATUSES = ["Running", "Scheduled", "Paused", "Draft"] as const;
export const CATEGORIES = ["Monitoring", "Research", "Competitive", "Earnings", "Macro", "Diligence"] as const;

export const agentScheduleSchema = z.object({
  frequency: z.enum(FREQUENCIES),
  day: z.enum(WEEKDAYS).optional(),
  time: z.string().max(20).optional(),
  timezone: z.string().max(8).optional(),
});
export type AgentScheduleSchema = z.infer<typeof agentScheduleSchema>;

export const insertAgentSchema = z.object({
  name: z.string().min(1).max(120),
  status: z.enum(STATUSES).optional(),
  templateSlug: z.string().min(1).max(80).optional(),
  category: z.enum(CATEGORIES),
  icon: z.string().min(1).max(8).optional(),
  schedule: agentScheduleSchema,
  instructions: z.string().max(8000),
});
export type InsertAgent = z.infer<typeof insertAgentSchema>;

export const patchAgentSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  status: z.enum(STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
  icon: z.string().min(1).max(8).optional(),
  schedule: agentScheduleSchema.optional(),
  instructions: z.string().max(8000).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });
export type PatchAgent = z.infer<typeof patchAgentSchema>;

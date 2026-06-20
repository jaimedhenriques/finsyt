import { pgTable, text, uuid, timestamp, index, jsonb, integer } from "drizzle-orm/pg-core";
import { z } from "zod";

// ── Visual Workflow Node Editor ──────────────────────────────────────────────
// Org/user-scoped, RLS-isolated definitions for the drag-and-drop workflow
// builder. A workflow is a DAG of typed nodes (data source → transform → AI
// agent → output) persisted as a `graph` jsonb payload. Workflows can be run on
// demand or registered with the existing in-process agent scheduler.
//
// Keyed by Clerk org id (text), exactly like `agents` / `blueprints`. Use
// `withClerkContext(orgId, userId, fn)` on every read/write so the parallel
// `app.current_clerk_org_id` / `app.current_clerk_user_id` GUCs are bound and
// the RLS policies in `rls-sql.ts` restrict rows to the caller's workspace.

export const workflowsTable = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    authorUserId: text("author_user_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    // Active | Paused | Draft — only Active rows with a schedule are picked up
    // by the scheduler tick.
    status: text("status").notNull().default("Draft"),
    // { nodes: WorkflowNode[], edges: WorkflowEdge[] }
    graph: jsonb("graph").notNull().default({ nodes: [], edges: [] }),
    // null = run on demand only. Otherwise WorkflowSchedule shape.
    schedule: jsonb("schedule"),
    lastRunAt: timestamp("last_run_at"),
    nextRunAt: timestamp("next_run_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("workflows_org_idx").on(t.orgId),
    byOrgStatus: index("workflows_org_status_idx").on(t.orgId, t.status),
    byNextRun: index("workflows_next_run_idx").on(t.nextRunAt),
  }),
);

export type WorkflowRow = typeof workflowsTable.$inferSelect;
export type InsertWorkflowRow = typeof workflowsTable.$inferInsert;

export const workflowRunsTable = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflowsTable.id, { onDelete: "cascade" }),
    workflowName: text("workflow_name").notNull(),
    triggeredBy: text("triggered_by").notNull().default("manual"), // manual | scheduled
    triggeredByUserId: text("triggered_by_user_id"),
    runStatus: text("run_status").notNull().default("running"), // running | ok | error
    // WorkflowNodeResult[] — per-node status/output snapshot.
    nodeResults: jsonb("node_results").notNull().default([]),
    errorMessage: text("error_message"),
    latencyMs: integer("latency_ms"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    byOrg: index("workflow_runs_org_idx").on(t.orgId),
    byOrgWorkflow: index("workflow_runs_org_workflow_idx").on(t.orgId, t.workflowId),
    byOrgStarted: index("workflow_runs_org_started_idx").on(t.orgId, t.startedAt),
  }),
);

export type WorkflowRunRow = typeof workflowRunsTable.$inferSelect;
export type InsertWorkflowRunRow = typeof workflowRunsTable.$inferInsert;

// ── Zod ──────────────────────────────────────────────────────────────────────

export const WORKFLOW_STATUSES = ["Active", "Paused", "Draft"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const WORKFLOW_FREQUENCIES = ["Daily", "Weekly", "Monthly"] as const;
export const WORKFLOW_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const workflowScheduleSchema = z.object({
  frequency: z.enum(WORKFLOW_FREQUENCIES),
  day: z.enum(WORKFLOW_WEEKDAYS).optional(),
  // 24h "HH:MM" UTC trigger time.
  time: z.string().max(5).regex(/^\d{2}:\d{2}$/, "time must be HH:MM").optional(),
});
export type WorkflowSchedule = z.infer<typeof workflowScheduleSchema>;

export const workflowNodeSchema = z.object({
  id: z.string().min(1).max(80),
  // Node type key, e.g. "source.quote" — validated against the catalog at run.
  type: z.string().min(1).max(60),
  label: z.string().max(160).optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  // Per-node configuration — shape depends on the node type's field set.
  config: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).default({}),
});
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export const workflowEdgeSchema = z.object({
  id: z.string().min(1).max(120),
  source: z.string().min(1).max(80),
  target: z.string().min(1).max(80),
  sourceHandle: z.string().max(60).optional(),
  targetHandle: z.string().max(60).optional(),
});
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

export const workflowGraphSchema = z.object({
  nodes: z.array(workflowNodeSchema).max(100),
  edges: z.array(workflowEdgeSchema).max(300),
});
export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;

export const insertWorkflowSchema = z.object({
  name: z.string().min(1).max(140),
  description: z.string().max(1000).optional(),
  status: z.enum(WORKFLOW_STATUSES).optional(),
  graph: workflowGraphSchema.optional(),
  schedule: workflowScheduleSchema.nullable().optional(),
});
export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;

export const patchWorkflowSchema = z.object({
  name: z.string().min(1).max(140).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(WORKFLOW_STATUSES).optional(),
  graph: workflowGraphSchema.optional(),
  schedule: workflowScheduleSchema.nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });
export type PatchWorkflow = z.infer<typeof patchWorkflowSchema>;

export const runWorkflowSchema = z.object({
  workflowId: z.string().uuid(),
});
export type RunWorkflowInput = z.infer<typeof runWorkflowSchema>;

// ── Per-node run result (persisted in workflow_runs.node_results) ─────────────
export interface WorkflowNodeResult {
  nodeId: string;
  type: string;
  label: string;
  status: "ok" | "error" | "skipped";
  /** Human-readable text output threaded into downstream agent prompts. */
  text: string;
  /** Structured payload for the UI / downstream nodes. */
  data?: unknown;
  sources: { label: string; meta: string }[];
  errorMessage?: string;
  latencyMs: number;
}

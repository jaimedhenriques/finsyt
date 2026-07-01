import { pgTable, text, uuid, timestamp, index, jsonb, boolean, integer } from "drizzle-orm/pg-core";
import { z } from "zod";

// ── Async delegated analyst jobs ────────────────────────────────────────────
// A delegated agent job is an on-demand, long-running unit of work that an
// analyst kicks off from a surface (company / workspace / research / matrix),
// then walks away from. A detached background runner executes it server-side,
// checkpointing its tool-call activity into `steps` so the jobs inbox can show
// a live stream and the analyst can close the tab and come back.
//
// Workspace-scoped via Clerk org id (text), keyed exactly like `agents` /
// `agent_runs`. Use `withClerkContext(orgId, userId, fn)` on every read/write
// so the `app.current_clerk_org_id` GUC is bound and the RLS policies in
// `rls-sql.ts` restrict rows to the caller's workspace.
//
// Iterate-on-thread: a follow-up creates a NEW row with `parentJobId` pointing
// at the prior job and a shared `threadId`. The inbox groups by `threadId`
// (latest version shown) and the detail view walks the chain for history.

export const DELIVERABLE_TYPES = ["memo", "deck", "model", "matrix", "research_note", "analysis"] as const;
export type DeliverableType = (typeof DELIVERABLE_TYPES)[number];

export const JOB_SURFACES = ["company", "workspace", "research", "matrix", "screener", "other"] as const;
export type JobSurface = (typeof JOB_SURFACES)[number];

export const JOB_STATUSES = ["queued", "running", "done", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const agentJobsTable = pgTable(
  "agent_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    authorUserId: text("author_user_id").notNull(),
    // Groups a job and all its iterate-on-thread follow-ups.
    threadId: uuid("thread_id").notNull(),
    // The immediate predecessor in an iterate chain (null for the root job).
    parentJobId: uuid("parent_job_id"),
    title: text("title").notNull(),
    brief: text("brief").notNull().default(""),
    deliverableType: text("deliverable_type").notNull().default("analysis"),
    surface: text("surface").notNull().default("other"),
    // Opaque context captured at delegation time: { symbol, workspaceId,
    // matrixId, … } — used to ground the runner and to deep-link the result.
    context: jsonb("context").notNull().default({}),
    status: text("status").notNull().default("queued"),
    currentStep: text("current_step").notNull().default("Queued"),
    progress: integer("progress").notNull().default(0),
    // Append-only activity stream of step / tool-call entries (see StepEntry).
    steps: jsonb("steps").notNull().default([]),
    // Final deliverable manifest (see JobResult): summary markdown, attachment
    // links (PPTX downloadUrl, research note id), and provenance.
    result: jsonb("result"),
    // Source/citation provenance carried by the deliverable.
    sources: jsonb("sources").notNull().default([]),
    error: text("error"),
    model: text("model"),
    provider: text("provider"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("agent_jobs_org_idx").on(t.orgId),
    byOrgStatus: index("agent_jobs_org_status_idx").on(t.orgId, t.status),
    byOrgThread: index("agent_jobs_org_thread_idx").on(t.orgId, t.threadId),
    byOrgCreated: index("agent_jobs_org_created_idx").on(t.orgId, t.createdAt),
    byOrgUnread: index("agent_jobs_org_unread_idx").on(t.orgId, t.read),
  }),
);

export type AgentJobRow = typeof agentJobsTable.$inferSelect;
export type InsertAgentJobRow = typeof agentJobsTable.$inferInsert;

// ── Activity-stream + result shapes (stored as jsonb) ───────────────────────
export interface JobStepEntry {
  ts: number;
  kind: "plan" | "tools" | "tool_call" | "tool_result" | "synthesise" | "deliverable" | "error" | "info";
  label: string;
  ok?: boolean;
  summary?: string;
  ms?: number;
}

export interface JobSource {
  label: string;
  meta?: string;
}

export interface JobAttachment {
  kind: "pptx" | "research_note" | "markdown";
  label: string;
  downloadUrl?: string;
  href?: string;
  noteId?: string;
  fileId?: string;
  bytes?: number;
  expiresAt?: number;
}

export interface JobResult {
  headline?: string;
  summary: string;
  findings?: { title: string; detail: string }[];
  attachments?: JobAttachment[];
}

// ── Zod ─────────────────────────────────────────────────────────────────────
export const jobContextSchema = z
  .object({
    symbol: z.string().max(20).optional(),
    workspaceId: z.string().max(80).optional(),
    matrixId: z.string().max(80).optional(),
    label: z.string().max(160).optional(),
  })
  .passthrough();

export const createAgentJobSchema = z.object({
  title: z.string().min(1).max(160),
  brief: z.string().min(1).max(8000),
  deliverableType: z.enum(DELIVERABLE_TYPES),
  surface: z.enum(JOB_SURFACES).optional(),
  context: jobContextSchema.optional(),
});
export type CreateAgentJobInput = z.infer<typeof createAgentJobSchema>;

export const iterateAgentJobSchema = z.object({
  brief: z.string().min(1).max(8000),
  // Optional overrides; default to the parent job's values.
  deliverableType: z.enum(DELIVERABLE_TYPES).optional(),
  title: z.string().min(1).max(160).optional(),
});
export type IterateAgentJobInput = z.infer<typeof iterateAgentJobSchema>;

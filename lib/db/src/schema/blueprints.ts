import { pgTable, text, uuid, timestamp, index, jsonb, integer } from "drizzle-orm/pg-core";
import { z } from "zod";

// ── Blueprint / Playbook Library ────────────────────────────────────────────
// First-class persisted multi-step playbooks. Each Blueprint owns a structured
// list of `steps` (each step is essentially a parameterised agent prompt) plus
// `parameters` declared at the Blueprint level so the workflow can be re-run
// with different inputs (ticker, peer set, deal name, etc.).
//
// Visibility tiers:
//   private    — only the author user can see it
//   team       — placeholder; today behaves identically to `firm` (any
//                workspace member). Future scope: a team_id column lets us
//                narrow this further without a re-migration.
//   firm       — every member of the workspace can see it
//   published  — Finsyt-curated, read-only, visible to every workspace.
//                These rows have `org_id = FINSYT_PUBLISHED_ORG_ID` (a Clerk-
//                shaped sentinel) and the SELECT policy unions them in.
//
// Versioning: a Blueprint update bumps `version` on the existing row AND
// snapshots the prior payload into `blueprint_versions`. Runs pin the
// `(blueprint_id, blueprint_version)` pair so reruns are reproducible even
// after the Blueprint has been edited.

export const FINSYT_PUBLISHED_ORG_ID = "org_finsyt_published";
export const FINSYT_PUBLISHED_USER_ID = "user_finsyt_published";

export const blueprintsTable = pgTable(
  "blueprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    authorUserId: text("author_user_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull(),
    icon: text("icon").notNull().default("◎"),
    visibility: text("visibility").notNull().default("private"),
    version: integer("version").notNull().default(1),
    parameters: jsonb("parameters").notNull().default([]),
    steps: jsonb("steps").notNull().default([]),
    expectedOutputs: jsonb("expected_outputs").notNull().default([]),
    requiredTools: jsonb("required_tools").notNull().default([]),
    requiredConnectors: jsonb("required_connectors").notNull().default([]),
    publishedSlug: text("published_slug"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("blueprints_org_idx").on(t.orgId),
    byOrgVisibility: index("blueprints_org_visibility_idx").on(t.orgId, t.visibility),
    byPublishedSlug: index("blueprints_published_slug_idx").on(t.publishedSlug),
  }),
);

export type BlueprintRow = typeof blueprintsTable.$inferSelect;
export type InsertBlueprintRow = typeof blueprintsTable.$inferInsert;

export const blueprintVersionsTable = pgTable(
  "blueprint_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    blueprintId: uuid("blueprint_id")
      .notNull()
      .references(() => blueprintsTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    payload: jsonb("payload").notNull(),
    authorUserId: text("author_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrgBlueprint: index("blueprint_versions_org_blueprint_idx").on(t.orgId, t.blueprintId),
    byBlueprintVersion: index("blueprint_versions_blueprint_version_idx").on(t.blueprintId, t.version),
  }),
);

export type BlueprintVersionRow = typeof blueprintVersionsTable.$inferSelect;

export const blueprintRunsTable = pgTable(
  "blueprint_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    blueprintId: uuid("blueprint_id")
      .notNull()
      .references(() => blueprintsTable.id, { onDelete: "cascade" }),
    blueprintVersion: integer("blueprint_version").notNull(),
    blueprintName: text("blueprint_name").notNull(),
    blueprintCategory: text("blueprint_category").notNull(),
    blueprintIcon: text("blueprint_icon").notNull().default("◎"),
    triggeredBy: text("triggered_by").notNull().default("manual"),
    triggeredByUserId: text("triggered_by_user_id"),
    triggeredByTriggerId: uuid("triggered_by_trigger_id"),
    parameters: jsonb("parameters").notNull().default({}),
    target: jsonb("target"),
    // runStatus values: running | ok | error | awaiting_approval | rejected
    runStatus: text("run_status").notNull().default("running"),
    stepResults: jsonb("step_results").notNull().default([]),
    finalOutput: jsonb("final_output"),
    sources: jsonb("sources").notNull().default([]),
    errorMessage: text("error_message"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    latencyMs: integer("latency_ms"),
    pinnedNoteId: uuid("pinned_note_id"),
    // HITL checkpoint: index of the step currently awaiting approval (-1 = none)
    pendingCheckpointIdx: integer("pending_checkpoint_idx"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    byOrg: index("blueprint_runs_org_idx").on(t.orgId),
    byOrgBlueprint: index("blueprint_runs_org_blueprint_idx").on(t.orgId, t.blueprintId),
    byOrgStarted: index("blueprint_runs_org_started_idx").on(t.orgId, t.startedAt),
  }),
);

export type BlueprintRunRow = typeof blueprintRunsTable.$inferSelect;
export type InsertBlueprintRunRow = typeof blueprintRunsTable.$inferInsert;

// ── Zod ────────────────────────────────────────────────────────────────────

export const BLUEPRINT_CATEGORIES = [
  "Monitoring",
  "Research",
  "Competitive",
  "Earnings",
  "Macro",
  "Diligence",
  "M&A",
  "Outreach",
] as const;

export const BLUEPRINT_VISIBILITIES = ["private", "team", "firm", "published"] as const;
export type BlueprintVisibility = (typeof BLUEPRINT_VISIBILITIES)[number];

export const PARAMETER_TYPES = ["text", "longtext", "ticker", "tickers", "select", "number", "date"] as const;

export const blueprintParameterSchema = z.object({
  key: z.string().min(1).max(60).regex(/^[a-z][a-z0-9_]*$/i, "key must be alphanumeric"),
  label: z.string().min(1).max(120),
  type: z.enum(PARAMETER_TYPES),
  required: z.boolean().optional(),
  defaultValue: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
  options: z.array(z.string()).optional(),
  helpText: z.string().max(400).optional(),
});
export type BlueprintParameter = z.infer<typeof blueprintParameterSchema>;

export const blueprintStepSchema = z.object({
  id: z.string().min(1).max(60),
  title: z.string().min(1).max(160),
  category: z.enum(BLUEPRINT_CATEGORIES).optional(),
  prompt: z.string().min(1).max(8000),
  outputKey: z.string().max(60).optional(),
  notes: z.string().max(400).optional(),
  /** When true, the run pauses after this step completes and waits for explicit user approval before continuing. */
  requiresApproval: z.boolean().optional(),
});
export type BlueprintStep = z.infer<typeof blueprintStepSchema>;

export const blueprintExpectedOutputSchema = z.object({
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(160),
  description: z.string().max(400).optional(),
});
export type BlueprintExpectedOutput = z.infer<typeof blueprintExpectedOutputSchema>;

export const insertBlueprintSchema = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be kebab-case").optional(),
  name: z.string().min(1).max(140),
  description: z.string().max(1000).optional(),
  category: z.enum(BLUEPRINT_CATEGORIES),
  icon: z.string().min(1).max(8).optional(),
  visibility: z.enum(BLUEPRINT_VISIBILITIES).optional(),
  parameters: z.array(blueprintParameterSchema).max(40).optional(),
  steps: z.array(blueprintStepSchema).min(1).max(20),
  expectedOutputs: z.array(blueprintExpectedOutputSchema).max(20).optional(),
  requiredTools: z.array(z.string().max(120)).max(40).optional(),
  requiredConnectors: z.array(z.string().max(120)).max(40).optional(),
});
export type InsertBlueprint = z.infer<typeof insertBlueprintSchema>;

export const patchBlueprintSchema = z.object({
  name: z.string().min(1).max(140).optional(),
  description: z.string().max(1000).optional(),
  category: z.enum(BLUEPRINT_CATEGORIES).optional(),
  icon: z.string().min(1).max(8).optional(),
  visibility: z.enum(BLUEPRINT_VISIBILITIES).optional(),
  parameters: z.array(blueprintParameterSchema).max(40).optional(),
  steps: z.array(blueprintStepSchema).min(1).max(20).optional(),
  expectedOutputs: z.array(blueprintExpectedOutputSchema).max(20).optional(),
  requiredTools: z.array(z.string().max(120)).max(40).optional(),
  requiredConnectors: z.array(z.string().max(120)).max(40).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });
export type PatchBlueprint = z.infer<typeof patchBlueprintSchema>;

export const runBlueprintSchema = z.object({
  blueprintId: z.string().uuid(),
  parameters: z.record(z.union([z.string(), z.number(), z.array(z.string())])).optional(),
  target: z.object({
    kind: z.enum(["matrix", "company", "peer-set", "workspace", "none"]).optional(),
    label: z.string().max(200).optional(),
    payload: z.record(z.unknown()).optional(),
  }).optional(),
});
export type RunBlueprintInput = z.infer<typeof runBlueprintSchema>;

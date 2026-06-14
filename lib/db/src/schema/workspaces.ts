import { pgTable, text, uuid, timestamp, index, integer, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod";
import { organizationsTable } from "./tenancy";

// ── Research workspaces (chat thread containers) ────────────────────────────
// Each row is a persistent research thread / context. Workspace-scoped via
// the organisations FK (UUID), like portfolio_positions and research_notes —
// callers must enter `withOrgContext(localUuid)` after `resolveLocalOrgId`.
//
// `chatMessages` (in research.ts) is keyed by `threadId` (uuid). We treat
// `workspaces.id` as that thread id, so the chat history for a workspace is
// a join: chat_messages WHERE thread_id = workspace.id AND org_id = …
//
// `kind` distinguishes plain research threads from PE-style "diligence"
// workspaces, and from the "deal" template (notebook + peer set + valuation +
// memo + deck scaffolded against a target ticker — see
// /api/workspaces/deal-team).

export const WORKSPACE_KINDS = ["research", "diligence", "deal"] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

// Shape of `metadata` for kind="deal" workspaces. Stored as raw JSONB so the
// type isn't enforced at the DB layer; API routes parse with `dealMetadataSchema`.
export interface DealWorkspaceMetadata {
  templateVersion: number;
  /**
   * Public-equity ticker the deal is anchored to. Mutually optional with
   * `targetCompanyId`: at least one must be present so downstream surfaces
   * (peers/valuation/memo/deck) can resolve a target.
   */
  targetSymbol?: string;
  /**
   * Private-company identifier (UUID from the private_companies table) for
   * deals on non-listed targets. When set, downstream surfaces should fall
   * back to private-company data instead of public-market peers.
   */
  targetCompanyId?: string;
  targetName?: string;
  peerSetId?: string;
  blueprintQueue?: Array<{
    slug: string;
    label?: string;
    runId?: string;
    status?: "queued" | "running" | "ok" | "error";
    queuedAt: number;
    completedAt?: number;
    note?: string;
  }>;
  latestMemoFileId?: string;
  latestMemoAt?: number;
  latestDeckFileId?: string;
  latestDeckAt?: number;
  staleSurfaces?: Array<"memo" | "deck" | "valuation">;
  clonedFromWorkspaceId?: string;
}

export const workspacesTable = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    color: text("color").notNull().default("var(--accent)"),
    pinned: boolean("pinned").notNull().default(false),
    tags: jsonb("tags").notNull().default([]),
    /** "research" (default) | "diligence" | "deal" — see WORKSPACE_KINDS. */
    kind: text("kind").notNull().default("research"),
    /** Optional ticker the workspace is anchored on (kind="deal"). */
    targetSymbol: text("target_symbol"),
    /** Free-form template state (peer set id, blueprint queue, stale flags). */
    metadata: jsonb("metadata").notNull().default({}),
    /**
     * Source ids the reviewer last had checked in the deal-room sidebar.
     * Persisted so reopening / switching into the workspace restores the
     * curated subset (e.g. "just the financial model + CIM, ignore the
     * legal pack") instead of re-selecting every hydrated source. Stored
     * as a jsonb array of opaque source-id strings; ids that no longer
     * exist on the workspace are silently ignored at hydration time.
     */
    selectedSourceIds: jsonb("selected_source_ids").notNull().default([]),
    messageCount: integer("message_count").notNull().default(0),
    lastMessage: text("last_message").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("workspaces_org_idx").on(t.orgId),
    byOrgPinned: index("workspaces_org_pinned_idx").on(t.orgId, t.pinned),
  }),
);

export type WorkspaceRow = typeof workspacesTable.$inferSelect;
export type InsertWorkspaceRow = typeof workspacesTable.$inferInsert;

const tickerSchema = z
  .string()
  .min(1)
  .max(12)
  .regex(/^[A-Z0-9.\-]+$/, "ticker must be uppercase letters, digits, '.' or '-'");

export const dealBlueprintQueueItemSchema = z.object({
  slug: z.string().min(1).max(120),
  label: z.string().max(160).optional(),
  runId: z.string().max(120).optional(),
  status: z.enum(["queued", "running", "ok", "error"]).optional(),
  queuedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative().optional(),
  note: z.string().max(280).optional(),
});

export const dealMetadataSchema = z
  .object({
    templateVersion: z.number().int().min(1).max(10),
    targetSymbol: tickerSchema.optional(),
    targetCompanyId: z.string().uuid().optional(),
    targetName: z.string().max(200).optional(),
    peerSetId: z.string().uuid().optional(),
    blueprintQueue: z.array(dealBlueprintQueueItemSchema).max(40).optional(),
    latestMemoFileId: z.string().max(120).optional(),
    latestMemoAt: z.number().int().nonnegative().optional(),
    latestDeckFileId: z.string().max(120).optional(),
    latestDeckAt: z.number().int().nonnegative().optional(),
    staleSurfaces: z.array(z.enum(["memo", "deck", "valuation"])).max(8).optional(),
    clonedFromWorkspaceId: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.targetSymbol || v.targetCompanyId), {
    message: "deal metadata requires targetSymbol or targetCompanyId",
    path: ["targetSymbol"],
  });

export const insertWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  color: z.string().max(60).optional(),
  pinned: z.boolean().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  kind: z.enum(WORKSPACE_KINDS).optional(),
  targetSymbol: tickerSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type InsertWorkspaceInput = z.infer<typeof insertWorkspaceSchema>;

export const patchWorkspaceSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  color: z.string().max(60).optional(),
  pinned: z.boolean().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  kind: z.enum(WORKSPACE_KINDS).optional(),
  targetSymbol: tickerSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
  messageCount: z.number().int().min(0).max(1_000_000).optional(),
  lastMessage: z.string().max(500).optional(),
  // Bound by max source-ids per workspace so a malicious caller can't bloat
  // the row. The id length cap matches the longest format we generate
  // (`<userId>:<sha256>`); shorter local ids are accepted too.
  selectedSourceIds: z.array(z.string().min(1).max(200)).max(2000).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });
export type PatchWorkspaceInput = z.infer<typeof patchWorkspaceSchema>;

// ── Workspace views (recent-opener presence signal) ─────────────────────────
// Tracks the most recent time each user opened a given workspace, so the
// deal-room sidebar can surface "Sarah opened Project Atlas 2h ago" badges
// before a reviewer dives in alongside teammates already taking notes.
//
// Tenant-scoped via the same UUID `org_id` channel as `workspaces` —
// `withOrgContext(localUuid)` binds `app.current_org_id`, RLS rejects any
// cross-org read or write. We keep one row per (workspace, user) and bump
// `opened_at` on every open, so the table stays bounded by team size × room
// count rather than growing per-open. That's enough to power "last opened by"
// chips without retaining a full audit log here (audit_events is the
// system-of-record for that).
export const workspaceViewsTable = pgTable(
  "workspace_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspacesTable.id, { onDelete: "cascade" }),
    /** Clerk user id (text) — the teammate who opened the workspace. */
    userId: text("user_id").notNull(),
    openedAt: timestamp("opened_at").defaultNow().notNull(),
  },
  (t) => ({
    // One row per (workspace, user) — used as the upsert target so each
    // additional open just bumps `opened_at` instead of appending a new row.
    uniqWorkspaceUser: uniqueIndex("workspace_views_workspace_user_uniq").on(
      t.workspaceId,
      t.userId,
    ),
    // Hot-path index for "give me the recent viewers of these workspaces in
    // my org" — used by GET /api/workspaces.
    byOrgWorkspaceOpenedAt: index("workspace_views_org_workspace_opened_idx").on(
      t.orgId,
      t.workspaceId,
      t.openedAt,
    ),
  }),
);

export type WorkspaceViewRow = typeof workspaceViewsTable.$inferSelect;
export type InsertWorkspaceView = typeof workspaceViewsTable.$inferInsert;

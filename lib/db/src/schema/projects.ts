import {
  pgTable,
  text,
  uuid,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { organizationsTable, ROLES, roleEnum } from "./tenancy";

// ── Deal-team Projects ───────────────────────────────────────────────────────
// A Project is a shared deal-team space that bundles context (workspaces,
// notes, peer sets, agent runs) for a group of org members working on the
// same deal or research theme. It complements the existing per-user
// diligence workspaces with cross-colleague visibility and a shared
// activity feed.
//
// RLS: all three tables key on `org_id` (UUID FK to organizations) via
// `app.current_org_id`, same as `workspaces` and `workspace_views`.
// Project-member access control is enforced by the API layer: reads require
// the caller to be a `project_members` row for the project (or an org
// admin/owner); writes require at least `manager` project role.

export const PROJECT_STATUSES = ["active", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projectsTable = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    /** Clerk user id of the teammate who created the project. */
    authorUserId: text("author_user_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** Hex colour token used to visually distinguish projects in the sidebar. */
    color: text("color").notNull().default("var(--accent)"),
    status: text("status").notNull().default("active"),
    /** Free-form metadata (target symbol, deal stage, etc.) */
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("projects_org_idx").on(t.orgId),
    byOrgStatus: index("projects_org_status_idx").on(t.orgId, t.status),
  }),
);

export type ProjectRow = typeof projectsTable.$inferSelect;
export type InsertProjectRow = typeof projectsTable.$inferInsert;

// ── Project membership ───────────────────────────────────────────────────────
// Project roles mirror the org role set (owner/admin/member/viewer) but are
// scoped to the project. An org admin/owner always has implicit access; for
// everyone else the presence of a `project_members` row controls visibility.
export const projectMembersTable = pgTable(
  "project_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    /** Clerk user id of the project member. */
    userId: text("user_id").notNull(),
    /** Role within the project. Reuses the same four-level org role enum. */
    role: roleEnum("role").notNull().default("member"),
    /** Who added this teammate to the project. */
    addedByUserId: text("added_by_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqProjectUser: uniqueIndex("project_members_project_user_uniq").on(
      t.projectId,
      t.userId,
    ),
    byProject: index("project_members_project_idx").on(t.projectId),
    byOrg: index("project_members_org_idx").on(t.orgId),
  }),
);

export type ProjectMemberRow = typeof projectMembersTable.$inferSelect;
export type InsertProjectMember = typeof projectMembersTable.$inferInsert;

// ── Project activity feed ────────────────────────────────────────────────────
// Lightweight event log: who did what inside the project. Powers the
// shared activity stream in the project detail page ("Sarah added a model
// 2h ago", "Omar ran IC Memo blueprint 5m ago"). Not a compliance audit
// trail — that's `audit_events`. Rows are append-only and capped at 500
// per project to stay bounded.
export const projectActivityTable = pgTable(
  "project_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    /** Clerk user id of the actor. */
    actorUserId: text("actor_user_id").notNull(),
    /**
     * Verb-style action label.
     * e.g. "added_workspace" | "added_note" | "added_peer_set" |
     *      "ran_blueprint" | "added_member" | "removed_member" |
     *      "created_project" | "updated_project" | "archived_project"
     */
    action: text("action").notNull(),
    /** "workspace" | "note" | "peer_set" | "blueprint_run" | "member" | "project" */
    resourceType: text("resource_type"),
    /** UUID of the linked resource, when applicable. */
    resourceId: text("resource_id"),
    /** Optional display label for the resource (name at the time of the action). */
    resourceLabel: text("resource_label"),
    /** Arbitrary extra payload (e.g. blueprint slug, ticker). */
    payload: jsonb("payload"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byProject: index("project_activity_project_idx").on(
      t.projectId,
      t.createdAt,
    ),
    byOrg: index("project_activity_org_idx").on(t.orgId),
  }),
);

export type ProjectActivityRow = typeof projectActivityTable.$inferSelect;
export type InsertProjectActivity = typeof projectActivityTable.$inferInsert;

// ── Project–resource links ───────────────────────────────────────────────────
// Polymorphic join table that attaches existing resources (workspaces, notes,
// peer sets) to a Project. The `resource_type` discriminator keeps a single
// table clean instead of three separate FKs.
export const PROJECT_RESOURCE_TYPES = [
  "workspace",
  "note",
  "peer_set",
] as const;
export type ProjectResourceType = (typeof PROJECT_RESOURCE_TYPES)[number];

export const projectLinksTable = pgTable(
  "project_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(),
    /** UUID of the linked resource. */
    resourceId: text("resource_id").notNull(),
    /** Snapshot of the resource name at link time. */
    resourceLabel: text("resource_label").notNull().default(""),
    linkedByUserId: text("linked_by_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqProjectResource: uniqueIndex(
      "project_links_project_resource_uniq",
    ).on(t.projectId, t.resourceType, t.resourceId),
    byProject: index("project_links_project_idx").on(t.projectId),
    byOrg: index("project_links_org_idx").on(t.orgId),
  }),
);

export type ProjectLinkRow = typeof projectLinksTable.$inferSelect;
export type InsertProjectLink = typeof projectLinksTable.$inferInsert;

// ── Zod validation schemas ───────────────────────────────────────────────────
export const insertProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  color: z.string().max(60).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type InsertProjectInput = z.infer<typeof insertProjectSchema>;

export const patchProjectSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
    color: z.string().max(60).optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });
export type PatchProjectInput = z.infer<typeof patchProjectSchema>;

export const addMemberSchema = z.object({
  userId: z.string().min(1).max(200),
  role: z.enum(ROLES).optional(),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const patchMemberSchema = z.object({
  role: z.enum(ROLES),
});
export type PatchMemberInput = z.infer<typeof patchMemberSchema>;

export const linkResourceSchema = z.object({
  resourceType: z.enum(PROJECT_RESOURCE_TYPES),
  resourceId: z.string().uuid(),
  resourceLabel: z.string().max(200).optional(),
});
export type LinkResourceInput = z.infer<typeof linkResourceSchema>;

export const unlinkResourceSchema = z.object({
  resourceType: z.enum(PROJECT_RESOURCE_TYPES),
  resourceId: z.string().uuid(),
});
export type UnlinkResourceInput = z.infer<typeof unlinkResourceSchema>;

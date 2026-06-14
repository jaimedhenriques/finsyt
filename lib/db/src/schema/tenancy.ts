import { pgTable, pgEnum, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod";

export const ROLES = ["owner", "admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const roleEnum = pgEnum("role", ROLES);

export const organizationsTable = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const membershipsTable = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: roleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqOrgUser: uniqueIndex("memberships_org_user_uniq").on(t.orgId, t.userId),
  }),
);

export const insertOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
});
export const insertMembershipSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().min(1).max(200),
  role: z.enum(ROLES).optional(),
});

export type Organization = typeof organizationsTable.$inferSelect;
export type Membership = typeof membershipsTable.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type InsertMembership = z.infer<typeof insertMembershipSchema>;

export const roleSchema = z.enum(ROLES);

const ROLE_RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export function roleAtLeast(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

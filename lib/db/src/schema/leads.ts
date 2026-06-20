import { pgTable, text, serial, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { z } from "zod";
import { organizationsTable } from "./tenancy";

export const leadsTable = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    firm: text("firm").notNull(),
    role: text("role").notNull(),
    aum: text("aum").notNull(),
    message: text("message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("leads_org_id_idx").on(t.orgId),
  }),
);

export const insertLeadSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  firm: z.string().min(1).max(200),
  role: z.string().min(1).max(120),
  aum: z.string().min(1).max(60),
  message: z.string().max(5000).optional().nullable(),
});

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;

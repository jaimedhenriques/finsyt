import { pgTable, text, uuid, timestamp, index, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod";

// ── Peer sets ───────────────────────────────────────────────────────────────
// Workspace-scoped reusable peer baskets that analysts curate, name, and
// reuse across screens. Keyed by Clerk org id (text) like screener_presets and
// agents. Visible to every member of the workspace; only the owner can edit
// or delete (mirrored in the RLS policies in `rls-sql.ts`).

export const peerSetsTable = pgTable(
  "peer_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    authorUserId: text("author_user_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("peer_sets_org_idx").on(t.orgId),
    byOrgName: index("peer_sets_org_name_idx").on(t.orgId, t.name),
  }),
);

export type PeerSetRow = typeof peerSetsTable.$inferSelect;
export type InsertPeerSetRow = typeof peerSetsTable.$inferInsert;

// ── Peer set members ────────────────────────────────────────────────────────
// One row per ticker in a peer set. Stores `position` to preserve the order
// the analyst added the peer in (the institutional comparison table renders
// peers in this order). Cascade delete when the parent set is removed.

export const peerSetMembersTable = pgTable(
  "peer_set_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    setId: uuid("set_id")
      .notNull()
      .references(() => peerSetsTable.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    symbol: text("symbol").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    bySet: index("peer_set_members_set_idx").on(t.setId, t.position),
    byOrg: index("peer_set_members_org_idx").on(t.orgId),
    uniqSetSymbol: uniqueIndex("peer_set_members_set_symbol_uniq").on(t.setId, t.symbol),
  }),
);

export type PeerSetMemberRow = typeof peerSetMembersTable.$inferSelect;
export type InsertPeerSetMemberRow = typeof peerSetMembersTable.$inferInsert;

// ── Validation schemas ──────────────────────────────────────────────────────
const SYMBOL_RE = /^[A-Z0-9.\-]{1,15}$/;
const symbolSchema = z.string().trim().toUpperCase().refine((s) => SYMBOL_RE.test(s), {
  message: "Invalid ticker symbol",
});

export const peerSetInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(280).optional().default(""),
  symbols: z.array(symbolSchema).max(50).optional().default([]),
});
export type PeerSetInput = z.infer<typeof peerSetInputSchema>;

export const peerSetPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().max(280).optional(),
    symbols: z.array(symbolSchema).max(50).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });
export type PeerSetPatch = z.infer<typeof peerSetPatchSchema>;

export const peerSetMemberInputSchema = z.object({
  symbol: symbolSchema,
});
export type PeerSetMemberInput = z.infer<typeof peerSetMemberInputSchema>;

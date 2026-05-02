import { pgTable, text, uuid, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod";
import { organizationsTable } from "./tenancy";

export const API_KEY_SCOPES = ["read", "read_write"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const API_KEY_TIERS = ["free", "paid", "enterprise"] as const;
export type ApiKeyTier = (typeof API_KEY_TIERS)[number];

export const TIER_RATE_LIMITS: Record<ApiKeyTier, number> = {
  free: 60,
  paid: 600,
  enterprise: 6000,
};

export const apiKeysTable = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scope: text("scope").notNull().default("read"),
    tier: text("tier").notNull().default("free"),
    rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(60),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("api_keys_org_idx").on(t.orgId),
    uniqHash: uniqueIndex("api_keys_hash_uniq").on(t.keyHash),
    byPrefix: index("api_keys_prefix_idx").on(t.prefix),
  }),
);

export type ApiKey = typeof apiKeysTable.$inferSelect;
export type NewApiKey = typeof apiKeysTable.$inferInsert;

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(120),
  scope: z.enum(API_KEY_SCOPES).default("read"),
  tier: z.enum(API_KEY_TIERS).optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

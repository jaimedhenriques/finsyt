import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./tenancy";

// ── Paid subscriptions & usage metering ─────────────────────────────────────
// Workspace-scoped billing state (UUID FK to organizations.id, like alerts /
// research_notes). Always read/write through `withOrgContext(localUuid)` after
// `resolveLocalOrgId(clerkOrgId)` so the `app.current_org_id` GUC is bound for
// RLS. Stripe is the source of truth; these rows are a synced projection kept
// up to date by the webhook handler.

export const PLAN_TIERS = ["free", "pro", "enterprise"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

// Mirrors Stripe subscription.status plus a local "none" sentinel for orgs
// that have never started a subscription.
export const SUBSCRIPTION_STATUSES = [
  "none",
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const orgSubscriptionsTable = pgTable(
  "org_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    plan: text("plan").notNull().default("free"),
    status: text("status").notNull().default("none"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    // One subscription row per org — the upsert target for webhook syncs.
    byOrg: uniqueIndex("org_subscriptions_org_idx").on(t.orgId),
    byCustomer: index("org_subscriptions_customer_idx").on(t.stripeCustomerId),
  }),
);

export type OrgSubscriptionRow = typeof orgSubscriptionsTable.$inferSelect;
export type InsertOrgSubscriptionRow = typeof orgSubscriptionsTable.$inferInsert;

// ── Usage counters ──────────────────────────────────────────────────────────
// Per-org, per-month metering for plan caps (e.g. the Free-tier monthly
// AI-query limit). `period` is "YYYY-MM" (UTC). One row per
// (org, period, metric); the cap enforcement path upserts + increments.

export const USAGE_METRICS = ["ai_query"] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];

export const usageCountersTable = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    metric: text("metric").notNull(),
    count: integer("count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("usage_counters_org_period_metric_idx").on(
      t.orgId,
      t.period,
      t.metric,
    ),
  }),
);

export type UsageCounterRow = typeof usageCountersTable.$inferSelect;
export type InsertUsageCounterRow = typeof usageCountersTable.$inferInsert;

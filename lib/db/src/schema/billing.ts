import { pgTable, text, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const SUBSCRIPTION_TIERS = ["free", "pro", "enterprise"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Per-Clerk-org subscription row — keyed on `clerk_org_id` (e.g. `org_2abc…`). */
export const orgSubscriptionsTable = pgTable("org_subscriptions", {
  clerkOrgId: text("clerk_org_id").primaryKey(),
  tier: text("tier").notNull().default("free"),
  status: text("status").notNull().default("active"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId: text("stripe_price_id"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: integer("cancel_at_period_end").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Monthly usage counters per org (e.g. AI research queries). */
export const usageCountersTable = pgTable(
  "usage_counters",
  {
    id: text("id").primaryKey(),
    clerkOrgId: text("clerk_org_id").notNull(),
    counterKey: text("counter_key").notNull(),
    period: text("period").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqOrgCounterPeriod: uniqueIndex("usage_counters_org_key_period_uniq").on(
      t.clerkOrgId,
      t.counterKey,
      t.period,
    ),
  }),
);

export type OrgSubscription = typeof orgSubscriptionsTable.$inferSelect;
export type UsageCounter = typeof usageCountersTable.$inferSelect;

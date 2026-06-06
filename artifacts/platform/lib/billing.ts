import "server-only";
import { db, orgSubscriptionsTable, usageCountersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { OPEN_MODE } from "./open-mode";
import {
  type BillingTier,
  FREE_AI_QUERY_LIMIT,
  AI_QUERY_COUNTER,
  isPaidTier,
  activeSubscription,
  usagePeriod,
  usageCounterId,
  checkFreeTierAiQuota,
} from "./billing-entitlements";

export type { BillingTier } from "./billing-entitlements";
export { FREE_AI_QUERY_LIMIT, AI_QUERY_COUNTER } from "./billing-entitlements";

export interface BillingStatus {
  tier: BillingTier;
  status: string;
  isPro: boolean;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  aiQueriesUsed: number;
  aiQueriesLimit: number | null;
  priceLabel: string | null;
}

export interface EntitlementResult {
  allowed: boolean;
  tier: BillingTier;
  reason?: string;
  aiQueriesUsed?: number;
  aiQueriesLimit?: number | null;
}

/** Resolve org tier from Postgres. Demo open-mode orgs always get Pro. */
export async function getOrgTier(clerkOrgId: string | null | undefined): Promise<BillingTier> {
  if (OPEN_MODE) return "pro";
  if (!clerkOrgId) return "free";

  const rows = await db
    .select({
      tier: orgSubscriptionsTable.tier,
      status: orgSubscriptionsTable.status,
    })
    .from(orgSubscriptionsTable)
    .where(eq(orgSubscriptionsTable.clerkOrgId, clerkOrgId))
    .limit(1);

  const row = rows[0];
  if (!row) return "free";

  const tier = (row.tier as BillingTier) || "free";
  if (!activeSubscription(row.status, tier)) return "free";
  return tier;
}

export async function getAiQueryCount(clerkOrgId: string): Promise<number> {
  const period = usagePeriod();
  const rows = await db
    .select({ count: usageCountersTable.count })
    .from(usageCountersTable)
    .where(
      and(
        eq(usageCountersTable.clerkOrgId, clerkOrgId),
        eq(usageCountersTable.counterKey, AI_QUERY_COUNTER),
        eq(usageCountersTable.period, period),
      ),
    )
    .limit(1);
  return rows[0]?.count ?? 0;
}

export async function incrementUsage(
  clerkOrgId: string,
  counterKey: string,
  delta = 1,
): Promise<number> {
  const period = usagePeriod();
  const id = usageCounterId(clerkOrgId, counterKey, period);

  const result = await db
    .insert(usageCountersTable)
    .values({
      id,
      clerkOrgId,
      counterKey,
      period,
      count: delta,
    })
    .onConflictDoUpdate({
      target: usageCountersTable.id,
      set: {
        count: sql`${usageCountersTable.count} + ${delta}`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ count: usageCountersTable.count });

  return result[0]?.count ?? delta;
}

/** Check whether an AI query is allowed and optionally increment the counter. */
export async function checkAiQueryEntitlement(
  clerkOrgId: string | null | undefined,
  options?: { increment?: boolean },
): Promise<EntitlementResult> {
  if (OPEN_MODE) {
    return { allowed: true, tier: "pro" };
  }

  if (!clerkOrgId) {
    return {
      allowed: false,
      tier: "free",
      reason: "Select a workspace to use AI research.",
    };
  }

  const tier = await getOrgTier(clerkOrgId);
  if (isPaidTier(tier)) {
    if (options?.increment) {
      await incrementUsage(clerkOrgId, AI_QUERY_COUNTER);
    }
    return { allowed: true, tier };
  }

  const used = await getAiQueryCount(clerkOrgId);
  const quota = checkFreeTierAiQuota(used);
  if (!quota.allowed) {
    return {
      allowed: false,
      tier: "free",
      reason: `Free plan includes ${FREE_AI_QUERY_LIMIT} AI queries per month. Upgrade to Pro for unlimited access.`,
      aiQueriesUsed: quota.used,
      aiQueriesLimit: quota.limit,
    };
  }

  if (options?.increment) {
    const newCount = await incrementUsage(clerkOrgId, AI_QUERY_COUNTER);
    return {
      allowed: true,
      tier: "free",
      aiQueriesUsed: newCount,
      aiQueriesLimit: FREE_AI_QUERY_LIMIT,
    };
  }

  return {
    allowed: true,
    tier: "free",
    aiQueriesUsed: used,
    aiQueriesLimit: FREE_AI_QUERY_LIMIT,
  };
}

export async function requireProFeature(
  clerkOrgId: string | null | undefined,
  featureName: string,
): Promise<EntitlementResult> {
  if (OPEN_MODE) return { allowed: true, tier: "pro" };

  const tier = await getOrgTier(clerkOrgId);
  if (isPaidTier(tier)) return { allowed: true, tier };

  return {
    allowed: false,
    tier: "free",
    reason: `${featureName} is a Pro feature. Upgrade to unlock.`,
  };
}

export async function getBillingStatus(
  clerkOrgId: string | null | undefined,
): Promise<BillingStatus> {
  if (OPEN_MODE) {
    return {
      tier: "pro",
      status: "active",
      isPro: true,
      stripeCustomerId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      aiQueriesUsed: 0,
      aiQueriesLimit: null,
      priceLabel: "Demo mode",
    };
  }

  if (!clerkOrgId) {
    return {
      tier: "free",
      status: "active",
      isPro: false,
      stripeCustomerId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      aiQueriesUsed: 0,
      aiQueriesLimit: FREE_AI_QUERY_LIMIT,
      priceLabel: null,
    };
  }

  const rows = await db
    .select()
    .from(orgSubscriptionsTable)
    .where(eq(orgSubscriptionsTable.clerkOrgId, clerkOrgId))
    .limit(1);

  const row = rows[0];
  const rawTier = (row?.tier as BillingTier) || "free";
  const tier = row && activeSubscription(row.status, rawTier) ? rawTier : "free";
  const isPro = isPaidTier(tier);
  const aiUsed = await getAiQueryCount(clerkOrgId);

  return {
    tier,
    status: row?.status ?? "active",
    isPro,
    stripeCustomerId: row?.stripeCustomerId ?? null,
    currentPeriodEnd: row?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: Boolean(row?.cancelAtPeriodEnd),
    aiQueriesUsed: aiUsed,
    aiQueriesLimit: isPro ? null : FREE_AI_QUERY_LIMIT,
    priceLabel: isPro ? "$29/month" : null,
  };
}

export async function upsertOrgSubscription(data: {
  clerkOrgId: string;
  tier?: BillingTier;
  status?: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}): Promise<void> {
  const now = new Date();
  await db
    .insert(orgSubscriptionsTable)
    .values({
      clerkOrgId: data.clerkOrgId,
      tier: data.tier ?? "free",
      status: data.status ?? "active",
      stripeCustomerId: data.stripeCustomerId ?? null,
      stripeSubscriptionId: data.stripeSubscriptionId ?? null,
      stripePriceId: data.stripePriceId ?? null,
      currentPeriodEnd: data.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ? 1 : 0,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: orgSubscriptionsTable.clerkOrgId,
      set: {
        tier: data.tier ?? sql`${orgSubscriptionsTable.tier}`,
        status: data.status ?? sql`${orgSubscriptionsTable.status}`,
        stripeCustomerId:
          data.stripeCustomerId !== undefined
            ? data.stripeCustomerId
            : sql`${orgSubscriptionsTable.stripeCustomerId}`,
        stripeSubscriptionId:
          data.stripeSubscriptionId !== undefined
            ? data.stripeSubscriptionId
            : sql`${orgSubscriptionsTable.stripeSubscriptionId}`,
        stripePriceId:
          data.stripePriceId !== undefined
            ? data.stripePriceId
            : sql`${orgSubscriptionsTable.stripePriceId}`,
        currentPeriodEnd:
          data.currentPeriodEnd !== undefined
            ? data.currentPeriodEnd
            : sql`${orgSubscriptionsTable.currentPeriodEnd}`,
        cancelAtPeriodEnd:
          data.cancelAtPeriodEnd !== undefined
            ? data.cancelAtPeriodEnd
              ? 1
              : 0
            : sql`${orgSubscriptionsTable.cancelAtPeriodEnd}`,
        updatedAt: now,
      },
    });
}

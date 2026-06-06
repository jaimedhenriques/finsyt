/**
 * Pure billing entitlement helpers — no DB or server-only imports.
 * Used by lib/billing.ts and unit-tested without Postgres.
 */

export type BillingTier = "free" | "pro" | "enterprise";

export const FREE_AI_QUERY_LIMIT = 10;
export const AI_QUERY_COUNTER = "ai_research_queries";

export function isPaidTier(tier: BillingTier): boolean {
  return tier === "pro" || tier === "enterprise";
}

/** Whether a stored subscription row grants paid feature access. */
export function activeSubscription(status: string, tier: BillingTier): boolean {
  if (!isPaidTier(tier)) return false;
  return status === "active" || status === "trialing" || status === "past_due";
}

/** UTC calendar month bucket for usage counters (YYYY-MM). */
export function usagePeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function usageCounterId(
  clerkOrgId: string,
  counterKey: string,
  period: string,
): string {
  return `${clerkOrgId}:${counterKey}:${period}`;
}

/** Map Stripe subscription status to internal tier for webhook handlers. */
export function tierFromStripeStatus(status: string): BillingTier {
  if (status === "active" || status === "trialing" || status === "past_due") {
    return "pro";
  }
  return "free";
}

export interface FreeTierQuotaCheck {
  allowed: boolean;
  used: number;
  limit: number;
}

/** Decide whether a free-tier org may consume another AI query. */
export function checkFreeTierAiQuota(used: number, limit = FREE_AI_QUERY_LIMIT): FreeTierQuotaCheck {
  return {
    allowed: used < limit,
    used,
    limit,
  };
}

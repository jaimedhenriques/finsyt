import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FREE_AI_QUERY_LIMIT,
  activeSubscription,
  checkFreeTierAiQuota,
  isPaidTier,
  tierFromStripeStatus,
  usageCounterId,
  usagePeriod,
} from "../billing-entitlements";

test("isPaidTier — pro and enterprise are paid", () => {
  assert.equal(isPaidTier("pro"), true);
  assert.equal(isPaidTier("enterprise"), true);
  assert.equal(isPaidTier("free"), false);
});

test("activeSubscription — grants access for active pro subscriptions", () => {
  assert.equal(activeSubscription("active", "pro"), true);
  assert.equal(activeSubscription("trialing", "pro"), true);
  assert.equal(activeSubscription("past_due", "pro"), true);
  assert.equal(activeSubscription("canceled", "pro"), false);
  assert.equal(activeSubscription("active", "free"), false);
});

test("tierFromStripeStatus — maps Stripe lifecycle to internal tier", () => {
  assert.equal(tierFromStripeStatus("active"), "pro");
  assert.equal(tierFromStripeStatus("trialing"), "pro");
  assert.equal(tierFromStripeStatus("past_due"), "pro");
  assert.equal(tierFromStripeStatus("canceled"), "free");
  assert.equal(tierFromStripeStatus("unpaid"), "free");
});

test("usagePeriod — returns UTC YYYY-MM", () => {
  const period = usagePeriod(new Date("2026-03-15T12:00:00Z"));
  assert.equal(period, "2026-03");
});

test("usageCounterId — stable composite key", () => {
  assert.equal(
    usageCounterId("org_abc", "ai_research_queries", "2026-03"),
    "org_abc:ai_research_queries:2026-03",
  );
});

test("checkFreeTierAiQuota — enforces monthly free limit", () => {
  assert.deepEqual(checkFreeTierAiQuota(0), {
    allowed: true,
    used: 0,
    limit: FREE_AI_QUERY_LIMIT,
  });
  assert.deepEqual(checkFreeTierAiQuota(9), {
    allowed: true,
    used: 9,
    limit: FREE_AI_QUERY_LIMIT,
  });
  assert.deepEqual(checkFreeTierAiQuota(10), {
    allowed: false,
    used: 10,
    limit: FREE_AI_QUERY_LIMIT,
  });
});

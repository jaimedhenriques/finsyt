/**
 * Server-side billing & entitlements layer.
 *
 * Resolves the caller's plan from `org_subscriptions` (RLS-scoped), exposes a
 * feature guard for route handlers, and enforces the Free-tier monthly
 * AI-query cap via `usage_counters`.
 *
 * OPEN_MODE (demo) always resolves to an Enterprise-equivalent principal so the
 * public demo workspace is never crippled by gating or usage caps.
 */
import 'server-only'
import { NextResponse } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import {
  withOrgContext,
  orgSubscriptionsTable,
  usageCountersTable,
  type PlanTier,
  type OrgSubscriptionRow,
} from '@workspace/db'
import { auth } from './auth-server'
import { resolveLocalOrgId } from './org-resolver'
import { OPEN_MODE } from './open-mode'
import { apiKeyEntitlementStore, tierToPlan } from './api-entitlement-context'
import {
  entitlementsFor,
  type Entitlements,
  type Feature,
} from './entitlements'

export interface EntitlementContext {
  userId: string
  orgRole: string | null
  /** Clerk org id (org_…) — null when the signed-in user has no active org. */
  clerkOrgId: string | null
  /** Local UUID org id used for RLS-scoped reads/writes. Null when no org. */
  localOrgId: string | null
  plan: PlanTier
  entitlements: Entitlements
  /** When true, all gating/usage checks are bypassed (demo / open mode). */
  bypass: boolean
}

const AI_METRIC = 'ai_query'

/** Current UTC billing period as "YYYY-MM". */
export function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7)
}

/**
 * Collapse a stored subscription row into the effective plan. A subscription
 * that is active/trialing/past_due (Stripe keeps serving during dunning) maps
 * to its plan; anything else falls back to the plan while the paid period is
 * still in the future (e.g. cancel-at-period-end), otherwise to free.
 */
export function effectivePlan(row: OrgSubscriptionRow | null): PlanTier {
  if (!row) return 'free'
  const plan = (row.plan as PlanTier) || 'free'
  if (plan === 'free') return 'free'
  if (row.status === 'active' || row.status === 'trialing' || row.status === 'past_due') {
    return plan
  }
  if (row.currentPeriodEnd && row.currentPeriodEnd.getTime() > Date.now()) {
    return plan
  }
  return 'free'
}

/** Load the subscription row for an org (RLS-scoped). */
export async function getOrgSubscription(
  localOrgId: string,
): Promise<OrgSubscriptionRow | null> {
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx
      .select()
      .from(orgSubscriptionsTable)
      .where(eq(orgSubscriptionsTable.orgId, localOrgId))
      .limit(1),
  )
  return rows[0] ?? null
}

const PLAN_RANK: Record<PlanTier, number> = { free: 0, pro: 1, enterprise: 2 }
/** Pick the more privileged of two plans (free < pro < enterprise). */
function higherPlan(a: PlanTier, b: PlanTier): PlanTier {
  return PLAN_RANK[a] >= PLAN_RANK[b] ? a : b
}

/**
 * Resolve the full entitlement context for the current request. Returns null
 * when there is no authenticated user (caller should 401).
 */
export async function resolveEntitlementContext(): Promise<EntitlementContext | null> {
  // Public API-key surface (v1 wrappers / MCP): the gated handlers are invoked
  // in-process with no Clerk session. When an API-key entitlement context is
  // active, resolve the plan from the key's org subscription (with the key's
  // own tier as a floor) instead of falling through to a 401.
  const apiCtx = apiKeyEntitlementStore.getStore()
  if (apiCtx) {
    let subPlan: PlanTier = 'free'
    try {
      const row = await getOrgSubscription(apiCtx.localOrgId)
      subPlan = effectivePlan(row)
    } catch {
      // Org id not resolvable for RLS — fall back to the key's tier only.
    }
    const plan = higherPlan(subPlan, tierToPlan(apiCtx.tier))
    return {
      userId: apiCtx.userId,
      orgRole: null,
      clerkOrgId: null,
      localOrgId: apiCtx.localOrgId,
      plan,
      entitlements: entitlementsFor(plan),
      bypass: false,
    }
  }

  const { userId, orgId, orgRole } = await auth()
  if (!userId) return null

  if (OPEN_MODE) {
    return {
      userId,
      orgRole: orgRole ?? null,
      clerkOrgId: orgId ?? null,
      localOrgId: null,
      plan: 'enterprise',
      entitlements: entitlementsFor('enterprise'),
      bypass: true,
    }
  }

  if (!orgId) {
    // Signed-in but no active workspace — treat as Free, no usage tracking.
    return {
      userId,
      orgRole: orgRole ?? null,
      clerkOrgId: null,
      localOrgId: null,
      plan: 'free',
      entitlements: entitlementsFor('free'),
      bypass: false,
    }
  }

  const localOrgId = await resolveLocalOrgId(orgId)
  const row = await getOrgSubscription(localOrgId)
  const plan = effectivePlan(row)
  return {
    userId,
    orgRole: orgRole ?? null,
    clerkOrgId: orgId,
    localOrgId,
    plan,
    entitlements: entitlementsFor(plan),
    bypass: false,
  }
}

export interface FeatureGateResult {
  ok: boolean
  ctx: EntitlementContext | null
  response: NextResponse | null
}

/**
 * Guard a route on a paid feature. Use at the top of a handler:
 *
 *   const gate = await requireFeature('transcripts')
 *   if (!gate.ok) return gate.response
 *
 * Returns a 401 when unauthenticated, a 402 (payment required) with an
 * `upgrade_required` body when the plan lacks the feature, otherwise ok.
 */
export async function requireFeature(feature: Feature): Promise<FeatureGateResult> {
  const ctx = await resolveEntitlementContext()
  if (!ctx) {
    return {
      ok: false,
      ctx: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  if (ctx.bypass || ctx.entitlements.features.has(feature)) {
    return { ok: true, ctx, response: null }
  }
  return {
    ok: false,
    ctx,
    response: NextResponse.json(
      {
        error: 'upgrade_required',
        feature,
        plan: ctx.plan,
        message: 'This feature requires a paid plan. Upgrade to continue.',
        upgradeUrl: '/platform/app/upgrade',
      },
      { status: 402 },
    ),
  }
}

export interface AiUsage {
  used: number
  limit: number | null
  remaining: number | null
}

/** Read AI usage for the current period without mutating it. */
export async function getAiUsage(ctx: EntitlementContext): Promise<AiUsage> {
  const limit = ctx.entitlements.aiQueryLimit
  if (limit === null || ctx.bypass || !ctx.localOrgId) {
    return { used: 0, limit, remaining: null }
  }
  const period = currentPeriod()
  const used = await withOrgContext(ctx.localOrgId, async (tx) => {
    const rows = await tx
      .select({ count: usageCountersTable.count })
      .from(usageCountersTable)
      .where(
        and(
          eq(usageCountersTable.orgId, ctx.localOrgId!),
          eq(usageCountersTable.period, period),
          eq(usageCountersTable.metric, AI_METRIC),
        ),
      )
      .limit(1)
    return rows[0]?.count ?? 0
  })
  return { used, limit, remaining: Math.max(0, limit - used) }
}

export interface AiConsumeResult extends AiUsage {
  allowed: boolean
}

/**
 * Check the Free-tier AI cap and, when under the limit, atomically increment
 * the counter for the current period. Unlimited plans / bypass return allowed
 * without touching the DB.
 */
export async function checkAndConsumeAiQuery(
  ctx: EntitlementContext,
): Promise<AiConsumeResult> {
  const limit = ctx.entitlements.aiQueryLimit
  if (limit === null || ctx.bypass || !ctx.localOrgId) {
    return { allowed: true, used: 0, limit, remaining: null }
  }
  const period = currentPeriod()
  const localOrgId = ctx.localOrgId

  const used = (await getAiUsage(ctx)).used
  if (used >= limit) {
    return { allowed: false, used, limit, remaining: 0 }
  }

  await withOrgContext(localOrgId, (tx) =>
    tx
      .insert(usageCountersTable)
      .values({ orgId: localOrgId, period, metric: AI_METRIC, count: 1 })
      .onConflictDoUpdate({
        target: [
          usageCountersTable.orgId,
          usageCountersTable.period,
          usageCountersTable.metric,
        ],
        set: {
          count: sql`${usageCountersTable.count} + 1`,
          updatedAt: new Date(),
        },
      }),
  )

  const newUsed = used + 1
  return {
    allowed: true,
    used: newUsed,
    limit,
    remaining: Math.max(0, limit - newUsed),
  }
}

/** Upsert the synced subscription projection for an org (webhook path). */
export async function upsertOrgSubscription(
  localOrgId: string,
  values: {
    plan: PlanTier
    status: string
    stripeCustomerId?: string | null
    stripeSubscriptionId?: string | null
    stripePriceId?: string | null
    currentPeriodEnd?: Date | null
    cancelAtPeriodEnd?: boolean
  },
): Promise<void> {
  await withOrgContext(localOrgId, (tx) =>
    tx
      .insert(orgSubscriptionsTable)
      .values({
        orgId: localOrgId,
        plan: values.plan,
        status: values.status,
        stripeCustomerId: values.stripeCustomerId ?? null,
        stripeSubscriptionId: values.stripeSubscriptionId ?? null,
        stripePriceId: values.stripePriceId ?? null,
        currentPeriodEnd: values.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: values.cancelAtPeriodEnd ?? false,
      })
      .onConflictDoUpdate({
        target: orgSubscriptionsTable.orgId,
        set: {
          plan: values.plan,
          status: values.status,
          stripeCustomerId: values.stripeCustomerId ?? null,
          stripeSubscriptionId: values.stripeSubscriptionId ?? null,
          stripePriceId: values.stripePriceId ?? null,
          currentPeriodEnd: values.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: values.cancelAtPeriodEnd ?? false,
          updatedAt: new Date(),
        },
      }),
  )
}

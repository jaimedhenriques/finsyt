/**
 * Plan → entitlements mapping. Pure, dependency-free so it can be imported
 * from both server (gating, usage) and client (UI affordances) code.
 *
 * Tiers: free < pro < enterprise. Pro and Enterprise share the same feature
 * surface today (Enterprise differentiation — SSO, seats, custom limits — is
 * handled out-of-band / via sales), but they remain distinct tiers so future
 * gating can diverge without a migration.
 */
import type { PlanTier } from '@workspace/db'

export type Feature =
  | 'transcripts'
  | 'insider'
  | 'ownership'
  | 'export'
  | 'workflow_automation'
  | 'unlimited_ai'

/** Free-tier monthly cap on AI agent queries (server-enforced). */
export const FREE_AI_QUERY_LIMIT = 25

/** Free-tier cap on the number of symbols in the single workspace watchlist. */
export const FREE_WATCHLIST_LIMIT = 25

export interface Entitlements {
  plan: PlanTier
  /** null = unlimited. Number = monthly cap on AI agent queries. */
  aiQueryLimit: number | null
  /** null = unlimited. Number = max symbols in the workspace watchlist. */
  watchlistLimit: number | null
  features: ReadonlySet<Feature>
}

const PAID_FEATURES: Feature[] = [
  'transcripts',
  'insider',
  'ownership',
  'export',
  'workflow_automation',
  'unlimited_ai',
]

const FREE: Entitlements = {
  plan: 'free',
  aiQueryLimit: FREE_AI_QUERY_LIMIT,
  watchlistLimit: FREE_WATCHLIST_LIMIT,
  features: new Set<Feature>(),
}

const PAID = (plan: Exclude<PlanTier, 'free'>): Entitlements => ({
  plan,
  aiQueryLimit: null,
  watchlistLimit: null,
  features: new Set<Feature>(PAID_FEATURES),
})

export function entitlementsFor(plan: PlanTier): Entitlements {
  switch (plan) {
    case 'enterprise':
      return PAID('enterprise')
    case 'pro':
      return PAID('pro')
    case 'free':
    default:
      return FREE
  }
}

export function hasFeature(plan: PlanTier, feature: Feature): boolean {
  return entitlementsFor(plan).features.has(feature)
}

/** Human-readable label for surfacing in the UI / upgrade prompts. */
export const PLAN_LABELS: Record<PlanTier, string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

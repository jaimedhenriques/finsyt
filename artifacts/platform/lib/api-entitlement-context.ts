/**
 * Request-scoped entitlement context for the public API-key surface.
 *
 * The public API (`/api/v1/*` wrappers and the MCP endpoints) authenticates
 * with an API key, then invokes the existing `/api/*` route handlers in-process
 * (via `callInternalGet` / direct handler calls). Those handlers resolve the
 * caller's plan through `requireFeature` → Clerk `auth()`, which has no session
 * on an API-key request and would therefore 401.
 *
 * To keep paid/free gating consistent across the app and the public API without
 * coupling the handlers to a specific auth source, the API-key wrappers run the
 * downstream handler inside this AsyncLocalStorage. `resolveEntitlementContext`
 * (in `billing-server.ts`) reads the store and resolves the plan from the key's
 * org instead of falling through to a 401.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { PlanTier } from '@workspace/db'

export type ApiKeyTier = 'free' | 'paid' | 'enterprise'

export interface ApiKeyEntitlement {
  /** Local org UUID used for RLS-scoped subscription lookups. */
  localOrgId: string
  /** The key's author/principal id (for audit + context shape parity). */
  userId: string
  /** Rate-limit/provisioning tier carried on the key. */
  tier: ApiKeyTier
}

export const apiKeyEntitlementStore = new AsyncLocalStorage<ApiKeyEntitlement>()

/** Map an API-key tier onto a subscription PlanTier. */
export function tierToPlan(tier: ApiKeyTier): PlanTier {
  switch (tier) {
    case 'enterprise':
      return 'enterprise'
    case 'paid':
      return 'pro'
    case 'free':
    default:
      return 'free'
  }
}

/**
 * Run `fn` with the API-key entitlement context active so any route handler it
 * invokes in-process resolves the caller's plan from the key's org rather than
 * an (absent) Clerk session.
 */
export function runWithApiKeyEntitlement<T>(
  key: { orgId: string; authorUserId: string; tier: ApiKeyTier },
  fn: () => T,
): T {
  return apiKeyEntitlementStore.run(
    { localOrgId: key.orgId, userId: key.authorUserId, tier: key.tier },
    fn,
  )
}

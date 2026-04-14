import { createClient } from '@/lib/supabase/server'
import type { PlanKey } from '@/lib/stripe'

export type GateResult =
  | { allowed: true; plan: string }
  | { allowed: false; reason: string; requiredPlan: string }

const FEATURE_REQUIREMENTS: Record<string, PlanKey> = {
  'research': 'free',
  'screener': 'free',
  'markets': 'free',
  'news': 'free',
  'watchlist': 'free',
  'macro': 'free',
  'filings': 'pro',
  'workspaces': 'pro',
  'deals': 'pro',
  'developer': 'pro',
  'alerts': 'pro',
  'discovery': 'enterprise',
  'mcp': 'enterprise',
  'private': 'enterprise',
}

const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
}

export function meetsRequirement(userPlan: string, requiredPlan: string): boolean {
  return (PLAN_HIERARCHY[userPlan] ?? 0) >= (PLAN_HIERARCHY[requiredPlan] ?? 0)
}

export async function checkFeatureAccess(feature: string): Promise<GateResult> {
  const requiredPlan = FEATURE_REQUIREMENTS[feature] || 'free'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { allowed: false, reason: 'Not authenticated', requiredPlan }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, subscription_status')
    .eq('id', user.id)
    .single()

  const userPlan = profile?.plan || 'free'

  if (!meetsRequirement(userPlan, requiredPlan)) {
    return {
      allowed: false,
      reason: `This feature requires a ${requiredPlan} plan`,
      requiredPlan,
    }
  }

  return { allowed: true, plan: userPlan }
}

export function getFeatureRequirement(feature: string): PlanKey {
  return FEATURE_REQUIREMENTS[feature] || 'free'
}

export { FEATURE_REQUIREMENTS, PLAN_HIERARCHY }

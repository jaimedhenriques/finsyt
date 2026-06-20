/**
 * GET /api/billing
 * ────────────────
 * Returns the current org's plan, subscription state, AI usage for the month,
 * and whether Stripe billing is configured. Powers the upgrade page + settings
 * billing section.
 */
import { NextResponse } from 'next/server'
import {
  resolveEntitlementContext,
  getOrgSubscription,
  getAiUsage,
} from '@/lib/billing-server'
import { isBillingConfigured } from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await resolveEntitlementContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = ctx.localOrgId ? await getOrgSubscription(ctx.localOrgId) : null
  const usage = await getAiUsage(ctx)

  return NextResponse.json({
    plan: ctx.plan,
    status: row?.status ?? (ctx.bypass ? 'active' : 'none'),
    currentPeriodEnd: row?.currentPeriodEnd
      ? row.currentPeriodEnd.toISOString()
      : null,
    cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
    billingConfigured: isBillingConfigured(),
    demoMode: ctx.bypass,
    features: [...ctx.entitlements.features],
    usage: { aiQueries: usage },
  })
}

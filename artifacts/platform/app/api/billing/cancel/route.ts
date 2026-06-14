/**
 * POST /api/billing/cancel
 * ────────────────────────
 * Schedule the org's subscription to cancel at period end, or resume a pending
 * cancellation. Owner/admin only. Body: { resume?: boolean }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { withOrgContext, orgSubscriptionsTable } from '@workspace/db'
import { auth } from '@/lib/auth-server'
import { resolveLocalOrgId } from '@/lib/org-resolver'
import { getOrgSubscription } from '@/lib/billing-server'
import { isBillingConfigured, getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isBillingConfigured()) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 })
  }

  const { userId, orgId, orgRole } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_workspace' }, { status: 409 })
  if (orgRole !== 'org:admin') {
    return NextResponse.json({ error: 'forbidden', message: 'Only workspace admins can manage billing.' }, { status: 403 })
  }

  let body: { resume?: boolean } = {}
  try { body = await req.json() } catch { /* empty body ok */ }
  const resume = body?.resume === true

  const localOrgId = await resolveLocalOrgId(orgId)
  const row = await getOrgSubscription(localOrgId)
  if (!row?.stripeSubscriptionId) {
    return NextResponse.json({ error: 'no_subscription' }, { status: 404 })
  }

  try {
    await getStripe().subscriptions.update(row.stripeSubscriptionId, {
      cancel_at_period_end: !resume,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'stripe_error', message: (e as Error)?.message || 'Stripe update failed' },
      { status: 502 },
    )
  }

  await withOrgContext(localOrgId, (tx) =>
    tx
      .update(orgSubscriptionsTable)
      .set({ cancelAtPeriodEnd: !resume, updatedAt: new Date() })
      .where(eq(orgSubscriptionsTable.orgId, localOrgId)),
  )

  return NextResponse.json({ ok: true, cancelAtPeriodEnd: !resume })
}

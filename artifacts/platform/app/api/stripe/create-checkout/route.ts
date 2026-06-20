/**
 * GET /api/stripe/create-checkout?plan=pro|enterprise
 * ───────────────────────────────────────────────────
 * Creates a Stripe Checkout session for the caller's org and 303-redirects the
 * browser to Stripe's hosted page. A GET (rather than POST) so plan CTAs can be
 * plain links. On any precondition failure it redirects back to the upgrade
 * page with a `?status=` flag instead of returning JSON, so the UX stays inside
 * the product.
 *
 * Routes live under the platform basePath (/platform), so success/cancel URLs
 * and the upgrade redirect are all built from the request origin + basePath.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { resolveLocalOrgId } from '@/lib/org-resolver'
import { getOrgSubscription } from '@/lib/billing-server'
import { isBillingConfigured, getStripe, PLAN_PRICE_IDS } from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const basePath = req.nextUrl.basePath || process.env.NEXT_PUBLIC_BASE_PATH || '/platform'
  const origin = req.nextUrl.origin
  const upgrade = (status: string) =>
    NextResponse.redirect(`${origin}${basePath}/app/upgrade?status=${status}`, { status: 303 })

  if (!isBillingConfigured()) return upgrade('not_configured')

  const { userId, orgId } = await auth()
  if (!userId) return upgrade('signin_required')
  if (!orgId) return upgrade('no_workspace')

  const planParam = (req.nextUrl.searchParams.get('plan') || 'pro').toLowerCase()
  const plan: 'pro' | 'enterprise' = planParam === 'enterprise' ? 'enterprise' : 'pro'
  const priceId = PLAN_PRICE_IDS[plan]
  if (!priceId) return upgrade('price_not_configured')

  const localOrgId = await resolveLocalOrgId(orgId)
  const existing = await getOrgSubscription(localOrgId)

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}${basePath}/app/upgrade?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${basePath}/app/upgrade?status=cancelled`,
      client_reference_id: localOrgId,
      customer: existing?.stripeCustomerId || undefined,
      allow_promotion_codes: true,
      metadata: { localOrgId, clerkOrgId: orgId, plan, userId },
      subscription_data: {
        metadata: { localOrgId, clerkOrgId: orgId, plan },
      },
    })
    if (!session.url) return upgrade('error')
    return NextResponse.redirect(session.url, { status: 303 })
  } catch {
    return upgrade('error')
  }
}

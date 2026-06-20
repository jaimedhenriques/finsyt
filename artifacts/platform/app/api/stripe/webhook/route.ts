/**
 * POST /api/stripe/webhook
 * ────────────────────────
 * Stripe webhook receiver. Verifies the signature against the raw body, then
 * syncs the org's subscription projection in `org_subscriptions`. The org is
 * resolved from metadata we stamp at checkout (localOrgId), so the handler
 * never trusts caller-supplied identity beyond the signature-verified payload.
 *
 * Configure the endpoint in the Stripe dashboard at:
 *   https://<host>/platform/api/stripe/webhook
 * subscribed to: checkout.session.completed,
 *   customer.subscription.{created,updated,deleted}
 */
import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { withOrgContext, orgSubscriptionsTable } from '@workspace/db'
import { upsertOrgSubscription } from '@/lib/billing-server'
import {
  isWebhookConfigured,
  getStripe,
  priceIdToPlan,
  STRIPE_WEBHOOK_SECRET,
} from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function periodEnd(sub: Stripe.Subscription): Date | null {
  // `current_period_end` moved around across API versions; read defensively.
  const raw =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    (sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)
      ?.current_period_end
  return typeof raw === 'number' ? new Date(raw * 1000) : null
}

function priceIdOf(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null
}

async function syncFromSubscription(localOrgId: string, sub: Stripe.Subscription) {
  if (!UUID_RE.test(localOrgId)) return
  const priceId = priceIdOf(sub)
  await upsertOrgSubscription(localOrgId, {
    plan: priceIdToPlan(priceId),
    status: sub.status,
    stripeCustomerId:
      typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    currentPeriodEnd: periodEnd(sub),
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
  })
}

export async function POST(req: NextRequest) {
  if (!isWebhookConfigured()) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'missing signature' }, { status: 400 })

  const raw = await req.text()
  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const localOrgId =
          session.metadata?.localOrgId || session.client_reference_id || ''
        if (!localOrgId || !session.subscription) break
        const subId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id
        const sub = await getStripe().subscriptions.retrieve(subId)
        await syncFromSubscription(localOrgId, sub)
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const localOrgId = sub.metadata?.localOrgId || ''
        if (!localOrgId) break
        await syncFromSubscription(localOrgId, sub)
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const localOrgId = sub.metadata?.localOrgId || ''
        if (!localOrgId || !UUID_RE.test(localOrgId)) break
        await withOrgContext(localOrgId, (tx) =>
          tx
            .update(orgSubscriptionsTable)
            .set({
              plan: 'free',
              status: 'canceled',
              cancelAtPeriodEnd: false,
              updatedAt: new Date(),
            })
            .where(eq(orgSubscriptionsTable.orgId, localOrgId)),
        )
        break
      }
      default:
        break
    }
  } catch (e) {
    // Return 500 so Stripe retries transient failures.
    return NextResponse.json(
      { error: 'handler_failed', message: (e as Error)?.message || 'error' },
      { status: 500 },
    )
  }

  return NextResponse.json({ received: true })
}

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { upsertOrgSubscription } from "@/lib/billing";
import { tierFromStripeStatus } from "@/lib/billing-entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.clerk_org_id || session.client_reference_id;
  if (!orgId) return;

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  await upsertOrgSubscription({
    clerkOrgId: orgId,
    tier: "pro",
    status: "active",
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });
}

async function handleSubscription(sub: Stripe.Subscription) {
  const orgId = sub.metadata?.clerk_org_id;
  if (!orgId) return;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const tier = tierFromStripeStatus(sub.status);

  await upsertOrgSubscription({
    clerkOrgId: orgId,
    tier,
    status: sub.status,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  });
}

export async function POST(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe/webhook] handler failed for ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

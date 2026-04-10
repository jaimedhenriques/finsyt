import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { PlanCode, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const stripeSecret = process.env.STRIPE_SECRET_KEY;

const stripe =
  stripeSecret &&
  new Stripe(stripeSecret, {
    apiVersion: "2025-03-31.basil",
  });

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "trialing":
      return SubscriptionStatus.TRIALING;
    case "past_due":
      return SubscriptionStatus.PAST_DUE;
    case "canceled":
      return SubscriptionStatus.CANCELED;
    case "incomplete":
      return SubscriptionStatus.INCOMPLETE;
    case "unpaid":
      return SubscriptionStatus.UNPAID;
    default:
      return SubscriptionStatus.INCOMPLETE;
  }
}

function mapPlanCode(priceId?: string | null): PlanCode {
  if (!priceId) return PlanCode.FREE;
  if (priceId === process.env.STRIPE_PRICE_PRO) return PlanCode.PRO;
  if (priceId === process.env.STRIPE_PRICE_TEAM) return PlanCode.TEAM;
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return PlanCode.ENTERPRISE;
  return PlanCode.FREE;
}

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
  }

  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const organizationId = String(subscription.metadata.organizationId ?? "");

    if (organizationId) {
      const priceId = subscription.items.data[0]?.price.id ?? null;

      await prisma.subscription.upsert({
        where: {
          stripeSubscriptionId: subscription.id,
        },
        update: {
          status: mapStripeStatus(subscription.status),
          stripePriceId: priceId,
          planCode: mapPlanCode(priceId),
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
        create: {
          organizationId,
          status: mapStripeStatus(subscription.status),
          planCode: mapPlanCode(priceId),
          stripeCustomerId: String(subscription.customer),
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}

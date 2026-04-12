import { NextResponse } from "next/server"
import Stripe from "stripe"
import { getStripeConfig } from "@/lib/stripe/config"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature")
  const payload = await request.text()

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe signature header." }, { status: 400 })
  }

  const stripeConfig = getStripeConfig()
  if (!stripeConfig.isWebhookConfigured) {
    return NextResponse.json(
      { error: "Stripe env is not configured. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET." },
      { status: 500 },
    )
  }

  const stripe = new Stripe(stripeConfig.secretKey, { apiVersion: "2025-03-31.basil" })
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(payload, signature, stripeConfig.webhookSecret)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown signature verification error."
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.client_reference_id
    if (userId) {
      const supabase = getSupabaseAdminClient()
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null
      const priceId = session.metadata?.priceId ?? null

      const { error } = await supabase.from("profiles").upsert(
        {
          id: userId,
          plan: "pro",
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          stripe_price_id: priceId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )

      if (error) {
        console.error(`[stripe webhook] failed to upsert profile for ${userId}:`, error.message)
      }
    }
  }

  return NextResponse.json({ received: true })
}

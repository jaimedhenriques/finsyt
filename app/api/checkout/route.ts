import { NextResponse } from "next/server"
import Stripe from "stripe"
import { getStripeConfig } from "@/lib/stripe/config"

type CheckoutBody = {
  priceId?: string
  mode?: "subscription" | "payment"
  customerEmail?: string
}

export async function POST(request: Request) {
  const { secretKey, successPath, cancelPath, isConfigured, proPriceId } = getStripeConfig()
  if (!isConfigured) {
    return NextResponse.json(
      { error: "Stripe is not configured. Missing STRIPE_SECRET_KEY." },
      { status: 500 },
    )
  }

  let body: CheckoutBody = {}
  try {
    body = (await request.json()) as CheckoutBody
  } catch {
    body = {}
  }

  const priceId = body.priceId || proPriceId || process.env.STRIPE_PRO_PRICE_ID || ""
  if (!priceId) {
    return NextResponse.json(
      { error: "Missing price ID. Provide priceId or set STRIPE_PRICE_ID_PRO." },
      { status: 400 },
    )
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2025-03-31.basil" })
  const mode = body.mode || "subscription"
  const origin =
    request.headers.get("origin") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  const successUrl = `${origin}${successPath}`
  const cancelUrl = `${origin}${cancelPath}`

  try {
    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: body.customerEmail,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      metadata: {
        app: "finsyt-platform",
        plan: "pro",
        priceId,
      },
    })

    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create checkout session."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

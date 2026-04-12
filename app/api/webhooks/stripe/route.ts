import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const stripeSignature = req.headers.get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ""

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Missing STRIPE_WEBHOOK_SECRET environment variable." },
      { status: 500 },
    )
  }

  if (!stripeSignature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 },
    )
  }

  const payload = await req.text()

  // TODO(issue-17): verify signature with stripe.webhooks.constructEvent once Stripe SDK wiring is added.
  return NextResponse.json({
    ok: true,
    received: true,
    payloadLength: payload.length,
    signaturePresent: true,
  })
}

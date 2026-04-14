import { getStripeClient } from '@/lib/stripe'
import type Stripe from 'stripe'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

async function upsertSubscription(_event: Stripe.Event) {
  // TODO: Persist subscription state in Supabase once billing schema is finalized.
  return
}

async function handleSubscriptionDeleted(_event: Stripe.Event) {
  // TODO: Mark subscription as cancelled in Supabase once billing schema is finalized.
  return
}

export async function POST(req: Request) {
  let stripe
  try {
    stripe = getStripeClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe is not configured.'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Missing STRIPE_WEBHOOK_SECRET environment variable.' },
      { status: 500 },
    )
  }

  const body = await req.text()
  const headersList = await headers()
  const signature = headersList.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook signature error.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await upsertSubscription(event)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event)
        break
      default:
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook handler error.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

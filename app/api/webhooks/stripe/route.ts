import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })
  }

  const stripe = getStripe()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch (err: any) {
    console.error('[stripe-webhook] Signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.supabase_user_id
        if (userId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string)
          const priceId = sub.items.data[0]?.price.id
          const plan = determinePlan(priceId)

          await supabase.from('profiles').upsert({
            id: userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            plan,
            subscription_status: 'active',
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          })
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.supabase_user_id
        if (userId) {
          const priceId = sub.items.data[0]?.price.id
          const plan = determinePlan(priceId)
          await supabase.from('profiles').update({
            plan,
            subscription_status: sub.status,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          }).eq('id', userId)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.supabase_user_id
        if (userId) {
          await supabase.from('profiles').update({
            plan: 'free',
            subscription_status: 'canceled',
            stripe_subscription_id: null,
          }).eq('id', userId)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subId = invoice.subscription as string | null
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId)
          const userId = sub.metadata?.supabase_user_id
          if (userId) {
            await supabase.from('profiles').update({
              subscription_status: 'past_due',
            }).eq('id', userId)
          }
        }
        break
      }
    }
  } catch (err) {
    console.error('[stripe-webhook] Processing error:', err)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

function determinePlan(priceId: string | undefined): string {
  if (!priceId) return 'free'
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'pro'
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return 'enterprise'
  return 'pro'
}

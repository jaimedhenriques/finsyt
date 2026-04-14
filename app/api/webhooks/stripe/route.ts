import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''

async function verifyStripeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const parts = signature.split(',')
  const timestampPart = parts.find(p => p.startsWith('t='))
  const v1Part = parts.find(p => p.startsWith('v1='))
  if (!timestampPart || !v1Part) return false

  const timestamp = timestampPart.slice(2)
  const expectedSig = v1Part.slice(3)
  const signedPayload = `${timestamp}.${payload}`

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')

  // Constant-time comparison
  if (computed.length !== expectedSig.length) return false
  let mismatch = 0
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ expectedSig.charCodeAt(i)
  }
  return mismatch === 0
}

async function getStripeSubscription(subscriptionId: string) {
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` },
  })
  if (!res.ok) return null
  return res.json()
}

export async function POST(req: NextRequest) {
  if (!STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 })
  }

  const payload = await req.text()
  const signature = req.headers.get('stripe-signature') || ''

  const isValid = await verifyStripeSignature(payload, signature, STRIPE_WEBHOOK_SECRET)
  if (!isValid) {
    console.error('Invalid Stripe webhook signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: any
  try {
    event = JSON.parse(payload)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.metadata?.user_id || session.client_reference_id
        const plan = session.metadata?.plan || 'pro'

        if (!userId) break

        const subscriptionId = session.subscription
        const subscription = subscriptionId ? await getStripeSubscription(subscriptionId) : null

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: session.customer,
          stripe_subscription_id: subscriptionId,
          plan,
          status: 'active',
          current_period_end: subscription?.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

        console.log(`[stripe] checkout.session.completed: user ${userId} → ${plan}`)
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object
        const userId = sub.metadata?.user_id
        if (!userId) break

        const plan = sub.metadata?.plan || 'pro'
        const status = sub.status === 'active' ? 'active'
          : sub.status === 'trialing' ? 'trialing'
          : sub.status === 'past_due' ? 'past_due'
          : 'inactive'

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: sub.id,
          stripe_customer_id: sub.customer,
          plan,
          status,
          current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          cancel_at_period_end: sub.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

        console.log(`[stripe] subscription ${event.type}: user ${userId} → ${plan}/${status}`)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object
        const userId = sub.metadata?.user_id
        if (!userId) break

        await supabase.from('subscriptions').update({
          status: 'canceled',
          plan: 'free',
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId)

        console.log(`[stripe] subscription.deleted: user ${userId} downgraded to free`)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const customerId = invoice.customer
        if (!customerId) break

        const { data: sub } = await supabase.from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (sub) {
          await supabase.from('subscriptions').update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          }).eq('stripe_customer_id', customerId)

          console.log(`[stripe] invoice.payment_failed: customer ${customerId} → past_due`)
        }
        break
      }

      default:
        console.log(`[stripe] Unhandled event: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('[stripe] Webhook handler error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

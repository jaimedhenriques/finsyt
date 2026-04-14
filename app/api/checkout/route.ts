import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://finsyt.com'

const PLANS: Record<string, { priceId: string; name: string }> = {
  pro:        { priceId: process.env.STRIPE_PRO_PRICE_ID        || '', name: 'Pro' },
  enterprise: { priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || '', name: 'Enterprise' },
}

export async function POST(req: NextRequest) {
  if (!STRIPE_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { plan = 'pro' } = await req.json().catch(() => ({}))
  const planConfig = PLANS[plan]
  if (!planConfig || !planConfig.priceId) {
    return NextResponse.json({ error: `Invalid or unconfigured plan: ${plan}` }, { status: 400 })
  }

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'subscription',
        'payment_method_types[]': 'card',
        'line_items[0][price]': planConfig.priceId,
        'line_items[0][quantity]': '1',
        'success_url': `${APP_URL}/app/upgrade?success=true&session_id={CHECKOUT_SESSION_ID}`,
        'cancel_url': `${APP_URL}/app/upgrade?canceled=true`,
        'customer_email': user.email || '',
        'client_reference_id': user.id,
        'metadata[user_id]': user.id,
        'metadata[plan]': plan,
        'allow_promotion_codes': 'true',
        'subscription_data[metadata][user_id]': user.id,
        'subscription_data[metadata][plan]': plan,
      }),
    })

    if (!stripeRes.ok) {
      const err = await stripeRes.text()
      console.error('Stripe checkout error:', err)
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
    }

    const session = await stripeRes.json()
    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (err: any) {
    console.error('Checkout error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    plans: Object.entries(PLANS).map(([id, config]) => ({
      id,
      name: config.name,
      configured: !!config.priceId,
    }))
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { getStripe, PLANS } from '@/lib/stripe/config'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { plan, returnUrl } = await request.json()
    const planConfig = PLANS[plan as keyof typeof PLANS]

    if (!planConfig || plan === 'free' || !('priceId' in planConfig) || !planConfig.priceId) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    let customerId: string | undefined

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (sub?.stripe_customer_id) {
      customerId = sub.stripe_customer_id
    }

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${returnUrl || request.headers.get('origin')}/app?checkout=success`,
      cancel_url: `${returnUrl || request.headers.get('origin')}/app/upgrade?checkout=cancelled`,
      metadata: {
        user_id: user.id,
        plan,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan,
        },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[checkout] Error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}

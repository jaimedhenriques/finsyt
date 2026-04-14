import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { priceId, successUrl, cancelUrl } = await request.json()

    if (!priceId) {
      return NextResponse.json({ error: 'Missing priceId' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    const stripe = getStripe()
    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id

      await supabase
        .from('profiles')
        .upsert({ id: user.id, stripe_customer_id: customerId })
    }

    const origin = new URL(request.url).origin

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl || `${origin}/app/settings?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${origin}/app/upgrade`,
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
      metadata: { supabase_user_id: user.id },
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[checkout] Error:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 },
    )
  }
}

import { createClient as createSupabaseServerClient } from '@/lib/supabase/server'
import { getStripeClient } from '@/lib/stripe'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { priceId, plan } = (await req.json().catch(() => ({}))) as {
    priceId?: string
    plan?: string
  }

  let stripe
  try {
    stripe = getStripeClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe is not configured.'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const fallbackPriceId =
    process.env.STRIPE_PRO_PRICE_ID || process.env.STRIPE_PRICE_ID || ''
  const resolvedPriceId = priceId || fallbackPriceId

  if (!resolvedPriceId) {
    return NextResponse.json(
      { error: 'Missing Stripe price configuration.' },
      { status: 500 },
    )
  }

  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      customer_email: user.email,
      allow_promotion_codes: true,
      success_url: `${baseUrl}/app/upgrade?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/app/upgrade?checkout=cancelled`,
      metadata: {
        user_id: user.id,
        plan: plan || 'pro',
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Failed to create Stripe checkout session', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session.' },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest) {
  const plan = req.nextUrl.searchParams.get('plan') || 'pro'
  const fallbackPriceId =
    process.env.STRIPE_PRO_PRICE_ID || process.env.STRIPE_PRICE_ID || ''

  let stripe
  try {
    stripe = getStripeClient()
  } catch {
    return NextResponse.redirect(new URL(`/app/upgrade?checkout=error`, req.url))
  }

  if (!fallbackPriceId) {
    return NextResponse.redirect(new URL(`/app/upgrade?checkout=error`, req.url))
  }

  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL(`/app/auth/login?next=/app/upgrade`, req.url))
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: fallbackPriceId, quantity: 1 }],
      customer_email: user.email,
      allow_promotion_codes: true,
      success_url: `${baseUrl}/app/upgrade?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/app/upgrade?checkout=cancelled`,
      metadata: {
        user_id: user.id,
        plan,
      },
    })

    if (!session.url) {
      return NextResponse.redirect(new URL(`/app/upgrade?checkout=error`, req.url))
    }

    return NextResponse.redirect(session.url)
  } catch {
    return NextResponse.redirect(new URL(`/app/upgrade?checkout=error`, req.url))
  }
}

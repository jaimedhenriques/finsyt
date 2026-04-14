import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ plan: 'free', status: 'unauthenticated' })
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end, cancel_at_period_end, stripe_subscription_id')
    .eq('user_id', user.id)
    .single()

  if (!sub || sub.status === 'canceled' || sub.status === 'inactive') {
    return NextResponse.json({ plan: 'free', status: sub?.status || 'none' })
  }

  if (sub.current_period_end && new Date(sub.current_period_end) < new Date()) {
    return NextResponse.json({ plan: 'free', status: 'expired' })
  }

  return NextResponse.json({
    plan: sub.plan || 'free',
    status: sub.status,
    currentPeriodEnd: sub.current_period_end,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  })
}

export async function DELETE(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('user_id', user.id)
    .single()

  if (!sub?.stripe_subscription_id) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 404 })
  }

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
  if (!STRIPE_SECRET) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` },
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: 500 })
  }

  await supabase.from('subscriptions').update({
    cancel_at_period_end: true,
    updated_at: new Date().toISOString(),
  }).eq('user_id', user.id)

  return NextResponse.json({ success: true, message: 'Subscription will cancel at period end' })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const symbol = sp.get('symbol')?.toUpperCase()
  const activeOnly = sp.get('active') === 'true'

  let query = supabase.from('alerts').select('*').eq('user_id', user.id)
  if (symbol) query = query.eq('symbol', symbol)
  if (activeOnly) query = query.eq('is_active', true)
  query = query.order('created_at', { ascending: false })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alerts: data || [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action } = body

  if (action === 'create') {
    const { symbol, alert_type, threshold, condition, message, channel } = body
    if (!symbol || !alert_type) return NextResponse.json({ error: 'symbol and alert_type required' }, { status: 400 })

    const { data, error } = await supabase
      .from('alerts')
      .insert({
        user_id: user.id,
        symbol: symbol.toUpperCase(),
        alert_type,
        threshold,
        condition,
        message,
        channel: channel || 'email',
        is_active: true,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ alert: data })
  }

  if (action === 'toggle' && body.alertId) {
    const { data: alert } = await supabase.from('alerts').select('is_active').eq('id', body.alertId).eq('user_id', user.id).single()
    if (!alert) return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
    const { error } = await supabase.from('alerts').update({ is_active: !alert.is_active }).eq('id', body.alertId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, is_active: !alert.is_active })
  }

  if (action === 'delete' && body.alertId) {
    const { error } = await supabase.from('alerts').delete().eq('id', body.alertId).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('watchlists')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ watchlists: data || [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action, watchlistId, name, symbols, color } = body

  if (action === 'create') {
    const { data, error } = await supabase
      .from('watchlists')
      .insert({ user_id: user.id, name: name || 'New Watchlist', symbols: symbols || [], color: color || '#1B4FFF' })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ watchlist: data })
  }

  if (action === 'add_symbol' && watchlistId) {
    const { data: wl } = await supabase.from('watchlists').select('symbols').eq('id', watchlistId).eq('user_id', user.id).single()
    if (!wl) return NextResponse.json({ error: 'Watchlist not found' }, { status: 404 })
    const updated = [...new Set([...(wl.symbols || []), body.symbol?.toUpperCase()])]
    const { error } = await supabase.from('watchlists').update({ symbols: updated }).eq('id', watchlistId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, symbols: updated })
  }

  if (action === 'remove_symbol' && watchlistId) {
    const { data: wl } = await supabase.from('watchlists').select('symbols').eq('id', watchlistId).eq('user_id', user.id).single()
    if (!wl) return NextResponse.json({ error: 'Watchlist not found' }, { status: 404 })
    const updated = (wl.symbols || []).filter((s: string) => s !== body.symbol?.toUpperCase())
    const { error } = await supabase.from('watchlists').update({ symbols: updated }).eq('id', watchlistId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, symbols: updated })
  }

  if (action === 'delete' && watchlistId) {
    const { error } = await supabase.from('watchlists').delete().eq('id', watchlistId).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'rename' && watchlistId) {
    const { error } = await supabase.from('watchlists').update({ name }).eq('id', watchlistId).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

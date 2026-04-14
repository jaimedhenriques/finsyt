import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.email?.split('@')[0],
        avatar_url: user.user_metadata?.avatar_url,
      },
      profile: profile || {
        plan: 'free',
        subscription_status: null,
        queries_today: 0,
      },
    })
  } catch (err: any) {
    console.error('[user] Error:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 },
    )
  }
}

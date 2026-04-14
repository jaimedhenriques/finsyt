import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseConfig } from '@/lib/supabase/config'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const nextRaw = requestUrl.searchParams.get('next') || '/app/research'
  const next =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/app/research'
  const { isConfigured } = getSupabaseConfig()

  if (code && isConfigured) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  const redirectUrl = new URL(next, requestUrl.origin)
  return NextResponse.redirect(redirectUrl)
}

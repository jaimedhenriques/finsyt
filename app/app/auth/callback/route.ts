import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/app'

  if (!code) {
    return NextResponse.redirect(new URL('/app/auth/login?error=missing_code', request.url))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      new URL(`/app/auth/login?error=${encodeURIComponent(error.message)}`, request.url),
    )
  }

  return NextResponse.redirect(new URL(next, request.url))
}

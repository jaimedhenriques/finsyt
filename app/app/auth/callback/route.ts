import { NextResponse, type NextRequest } from 'next/server'

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createRouteHandlerClient } from '@/lib/supabase/server'

function sanitizeNextPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith('/app')) return '/app/research'
  return nextPath
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const nextPath = sanitizeNextPath(requestUrl.searchParams.get('next'))

  if (!isSupabaseConfigured()) {
    const loginUrl = new URL('/app/auth/login', request.url)
    loginUrl.searchParams.set('error', 'auth_not_configured')
    loginUrl.searchParams.set('next', nextPath)
    return NextResponse.redirect(loginUrl)
  }

  const code = requestUrl.searchParams.get('code')

  if (!code) {
    const loginUrl = new URL('/app/auth/login', request.url)
    loginUrl.searchParams.set('error', 'missing_code')
    loginUrl.searchParams.set('next', nextPath)
    return NextResponse.redirect(loginUrl)
  }

  const successUrl = new URL(nextPath, request.url)
  const response = NextResponse.redirect(successUrl)
  const supabase = createRouteHandlerClient(request, response)

  if (!supabase) {
    const loginUrl = new URL('/app/auth/login', request.url)
    loginUrl.searchParams.set('error', 'auth_not_configured')
    loginUrl.searchParams.set('next', nextPath)
    return NextResponse.redirect(loginUrl)
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    const loginUrl = new URL('/app/auth/login', request.url)
    loginUrl.searchParams.set('error', error.message)
    loginUrl.searchParams.set('next', nextPath)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

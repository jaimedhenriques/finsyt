import { NextResponse, type NextRequest } from 'next/server'

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createMiddlewareClient } from '@/lib/supabase/middleware'

function isAuthRoute(pathname: string) {
  return pathname === '/app/auth' || pathname.startsWith('/app/auth/')
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (isAuthRoute(pathname)) {
    return NextResponse.next()
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/app/auth/login'
  loginUrl.searchParams.set('next', `${pathname}${search}`)

  if (!isSupabaseConfigured()) {
    loginUrl.searchParams.set('error', 'auth_not_configured')
    return NextResponse.redirect(loginUrl)
  }

  const response = NextResponse.next()
  const supabase = createMiddlewareClient(request, response)

  if (!supabase) {
    loginUrl.searchParams.set('error', 'auth_not_configured')
    return NextResponse.redirect(loginUrl)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/app/:path*'],
}

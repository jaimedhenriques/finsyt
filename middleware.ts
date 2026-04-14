import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const PUBLIC_PATHS = [
  '/app/auth/login',
  '/app/auth/signup',
  '/app/auth/callback',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    const { supabaseResponse } = await updateSession(request)
    return supabaseResponse
  }

  const { user, supabaseResponse } = await updateSession(request)

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/app/auth/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/app/:path*'],
}

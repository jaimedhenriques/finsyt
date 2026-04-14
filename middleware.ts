import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function resolveSupabaseEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_URL ||
    ''

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY ||
    ''

  return { url, anonKey }
}

const AUTH_BYPASS_PATHS = new Set([
  '/app/auth/login',
  '/app/auth/signup',
  '/app/auth/callback',
  '/app/upgrade',
])

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (AUTH_BYPASS_PATHS.has(pathname)) {
    return NextResponse.next()
  }

  const { url, anonKey } = resolveSupabaseEnv()
  if (!url || !anonKey) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/app/auth/login'
    loginUrl.searchParams.set('next', pathname)
    loginUrl.searchParams.set('error', 'auth_not_configured')
    return NextResponse.redirect(loginUrl)
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({
          request,
        })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/app/auth/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/app/:path*'],
}

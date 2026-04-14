import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseConfig } from '@/lib/supabase/config'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAuthRoute = pathname.startsWith('/app/auth')

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const { url, anonKey, isConfigured } = getSupabaseConfig()
  if (!isConfigured) {
    if (isAuthRoute) {
      return response
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/app/auth/login'
    const redirectPath = `${pathname}${request.nextUrl.search || ''}`
    loginUrl.searchParams.set('next', redirectPath)
    return NextResponse.redirect(loginUrl)
  }

  const supabase = createServerClient(url!, anonKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !isAuthRoute) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/app/auth/login'
    const redirectPath = `${pathname}${request.nextUrl.search || ''}`
    loginUrl.searchParams.set('next', redirectPath)
    return NextResponse.redirect(loginUrl)
  }

  if (user && isAuthRoute) {
    const appUrl = request.nextUrl.clone()
    appUrl.pathname = '/app/research'
    appUrl.search = ''
    return NextResponse.redirect(appUrl)
  }

  return response
}

export const config = {
  matcher: ['/app/:path*'],
}

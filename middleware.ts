import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

const PUBLIC_PATHS = [
  '/app/auth/login',
  '/app/auth/signup',
  '/app/auth/callback',
  '/app/auth/reset-password',
  '/app/auth/update-password',
  '/api/health',
  '/api/webhooks',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only guard /app/* routes
  const isAppRoute = pathname.startsWith('/app/')
  if (!isAppRoute) return NextResponse.next()

  // Always allow auth routes
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_URL!,
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = new URL('/app/auth/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/app/:path*',
  ],
}

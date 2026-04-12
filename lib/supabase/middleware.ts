import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Public paths that don't need auth
  const isAuthRoute = pathname.startsWith("/app/auth")
  const isApiRoute = pathname.startsWith("/api")
  const isPublicRoute = pathname === "/" || pathname === "/landing"

  if (isAuthRoute || isApiRoute || isPublicRoute) {
    return supabaseResponse
  }

  // Protect /app/* — redirect to login if no session
  if (!user && pathname.startsWith("/app")) {
    const url = request.nextUrl.clone()
    url.pathname = "/app/auth/login"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  // Logged-in users hitting login/signup → redirect to app
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/app/research"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

import { getSupabasePublicEnv } from "@/lib/supabase/config"
import { getSafeNextPath } from "@/lib/supabase/redirect"

const AUTH_PATH_PREFIX = "/app/auth"

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (!pathname.startsWith("/app") || pathname.startsWith(AUTH_PATH_PREFIX)) {
    return NextResponse.next()
  }

  const { url, anonKey } = getSupabasePublicEnv()
  if (!url || !anonKey) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/app/auth/login"
    loginUrl.searchParams.set("next", getSafeNextPath(`${pathname}${search}`))
    loginUrl.searchParams.set("reason", "config")
    return NextResponse.redirect(loginUrl)
  }

  const response = NextResponse.next({
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
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    return response
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = "/app/auth/login"
  loginUrl.searchParams.set("next", getSafeNextPath(`${pathname}${search}`))

  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/app/:path*"],
}

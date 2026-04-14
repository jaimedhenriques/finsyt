import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { getSupabasePublicEnv, hasSupabasePublicEnv } from "@/lib/supabase/config"

function buildLoginRedirect(request: NextRequest, error?: string) {
  const loginUrl = new URL("/app/auth/login", request.url)
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`

  loginUrl.searchParams.set("next", nextPath)
  if (error) loginUrl.searchParams.set("error", error)

  return NextResponse.redirect(loginUrl)
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/app/auth")) {
    return NextResponse.next()
  }

  if (!hasSupabasePublicEnv()) {
    return buildLoginRedirect(request, "missing_config")
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const { url, anonKey } = getSupabasePublicEnv()
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

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return buildLoginRedirect(request)
  }

  return response
}

export const config = {
  matcher: ["/app/:path*"],
}

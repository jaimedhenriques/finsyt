import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware"
import { getSupabaseEnv } from "@/lib/supabase/env"

const AUTH_PATH_PREFIX = "/app/auth"
const APP_PATH_PREFIX = "/app"

function isProtectedPath(pathname: string): boolean {
  return pathname.startsWith(APP_PATH_PREFIX) && !pathname.startsWith(AUTH_PATH_PREFIX)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!isProtectedPath(pathname)) return NextResponse.next()

  const { isConfigured } = getSupabaseEnv()
  if (!isConfigured) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = `${AUTH_PATH_PREFIX}`
    redirectUrl.searchParams.set("next", pathname)
    redirectUrl.searchParams.set("error", "supabase_not_configured")
    return NextResponse.redirect(redirectUrl)
  }

  const response = NextResponse.next()
  const supabase = createSupabaseMiddlewareClient(request, response)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) return response

  const redirectUrl = request.nextUrl.clone()
  redirectUrl.pathname = `${AUTH_PATH_PREFIX}`
  redirectUrl.searchParams.set("next", pathname)
  return NextResponse.redirect(redirectUrl)
}

export const config = {
  matcher: ["/app/:path*"],
}

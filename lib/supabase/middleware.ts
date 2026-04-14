import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { requireSupabaseEnv } from "@/lib/supabase/env"

export function createMiddlewareClient(request: NextRequest, response: NextResponse) {
  const { url, anonKey } = requireSupabaseEnv()

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({
          name,
          value,
          ...options,
        })
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({
          name,
          value: "",
          ...options,
        })
      },
    },
  })
}

const AUTH_PATH_PREFIX = "/app/auth"
const DEFAULT_REDIRECT = "/app/research"

function canBypassAuth(pathname: string) {
  return pathname.startsWith(AUTH_PATH_PREFIX)
}

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  let supabase
  try {
    supabase = createMiddlewareClient(request, response)
  } catch {
    return response
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl
  if (!user && !canBypassAuth(pathname)) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = `${AUTH_PATH_PREFIX}/login`
    loginUrl.searchParams.set("redirect", `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  if (user && canBypassAuth(pathname)) {
    const appUrl = request.nextUrl.clone()
    appUrl.pathname = DEFAULT_REDIRECT
    appUrl.search = ""
    return NextResponse.redirect(appUrl)
  }

  return response
}

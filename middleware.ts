import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { getSupabaseConfig, hasSupabaseConfig } from "@/lib/supabase/config"

const PUBLIC_APP_PATHS = new Set(["/app/auth"])

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith("/app")) return NextResponse.next()
  if (PUBLIC_APP_PATHS.has(pathname)) return NextResponse.next()
  if (!hasSupabaseConfig()) return NextResponse.next()

  const { url, anonKey } = getSupabaseConfig()
  const response = NextResponse.next()
  const supabase = createServerClient(url, anonKey, {
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

  if (!user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/app/auth"
    redirectUrl.searchParams.set("redirectedFrom", pathname)
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: ["/app/:path*"],
}

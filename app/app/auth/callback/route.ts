import { NextRequest, NextResponse } from "next/server"

import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server"

function sanitiseNextPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith("/")) return "/app"
  if (!nextPath.startsWith("/app")) return "/app"
  if (nextPath.startsWith("/app/auth")) return "/app"
  return nextPath
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const nextPath = sanitiseNextPath(url.searchParams.get("next"))

  if (!hasSupabaseServerEnv()) {
    return NextResponse.redirect(new URL("/app/auth/login?error=missing_config", request.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL("/app/auth/login?error=oauth_callback", request.url))
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL("/app/auth/login?error=oauth_exchange", request.url))
  }

  return NextResponse.redirect(new URL(nextPath, request.url))
}

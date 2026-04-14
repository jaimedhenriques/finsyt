import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { isSupabaseConfigured } from "@/lib/supabase/env"

function normaliseRedirectPath(raw: string | null) {
  if (!raw || !raw.startsWith("/app")) return "/app/research"
  return raw
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const redirectPath = normaliseRedirectPath(
    url.searchParams.get("redirect") ?? url.searchParams.get("next"),
  )
  const origin = url.origin

  if (code && isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient()
    if (supabase) {
      await supabase.auth.exchangeCodeForSession(code)
    }
  }

  return NextResponse.redirect(new URL(redirectPath, origin))
}

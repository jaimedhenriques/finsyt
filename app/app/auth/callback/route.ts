import { NextResponse } from "next/server"

import { getSafeNextPath } from "@/lib/supabase/redirect"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"))
  const origin = requestUrl.origin

  if (code) {
    const supabase = await createClient()
    if (supabase) {
      await supabase.auth.exchangeCodeForSession(code)
    }
  }

  return NextResponse.redirect(new URL(nextPath, origin))
}

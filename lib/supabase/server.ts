import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { getSupabasePublicEnv, hasSupabasePublicEnv } from "@/lib/supabase/config"

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const { url, anonKey } = getSupabasePublicEnv()

  if (!url || !anonKey) {
    throw new Error("Missing Supabase server configuration.")
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server components can read the refreshed session even when cookie writes
          // are deferred to middleware or route handlers.
        }
      },
    },
  })
}

export { hasSupabasePublicEnv as hasSupabaseServerEnv }

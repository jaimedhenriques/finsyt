import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { getSupabaseConfig } from "@/lib/supabase/config"

export async function createSupabaseServerClient() {
  const { url, anonKey } = getSupabaseConfig()
  const cookieStore = await cookies()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options)
        })
      },
    },
  })
}

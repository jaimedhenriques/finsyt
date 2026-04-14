import { createServerClient as createSsrServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseEnv } from "@/lib/supabase/env"

export async function createSupabaseServerClient() {
  const env = getSupabaseEnv()
  if (!env) return null

  const cookieStore = await cookies()
  const { url, anonKey } = env

  return createSsrServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options)
        }
      },
    },
  })
}

export async function createServerClient() {
  return createSupabaseServerClient()
}


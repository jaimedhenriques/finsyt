import { createBrowserClient } from "@supabase/ssr"
import { getSupabaseEnv } from "@/lib/supabase/env"

export function createSupabaseBrowserClient() {
  const { url, anonKey } = getSupabaseEnv()
  if (!url || !anonKey) {
    throw new Error("Supabase env is not configured for browser auth client.")
  }
  return createBrowserClient(url, anonKey)
}

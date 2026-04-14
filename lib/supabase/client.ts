import { createBrowserClient } from "@supabase/ssr"
import { type SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseEnv } from "@/lib/supabase/env"

let browserClient: SupabaseClient | null = null

export function createClient() {
  if (browserClient) return browserClient
  const env = getSupabaseEnv()
  if (!env) return null
  const { url, anonKey } = env
  browserClient = createBrowserClient(url, anonKey)
  return browserClient
}


import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getSupabasePublicEnv } from "@/lib/supabase/config"

let browserClient: SupabaseClient | null = null

export function createSupabaseBrowserClient() {
  if (browserClient) return browserClient

  const { url, anonKey } = getSupabasePublicEnv()

  if (!url || !anonKey) {
    throw new Error("Missing Supabase browser configuration.")
  }

  browserClient = createBrowserClient(url, anonKey)
  return browserClient
}

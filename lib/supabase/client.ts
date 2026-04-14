import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseConfig } from '@/lib/supabase/config'

let browserClient: SupabaseClient | null = null

export function createClient() {
  const { url, anonKey, isConfigured } = getSupabaseConfig()
  if (!isConfigured) {
    return null
  }

  if (browserClient) {
    return browserClient
  }

  browserClient = createBrowserClient(url!, anonKey!)
  return browserClient
}

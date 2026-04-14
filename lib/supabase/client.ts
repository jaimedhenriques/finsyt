'use client'

import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getSupabasePublicEnv, isSupabaseConfigured } from "@/lib/supabase/config"

let browserClient: SupabaseClient | null = null

export function createClient(): SupabaseClient | null {
  if (browserClient) return browserClient

  const { url, anonKey } = getSupabasePublicEnv()
  if (!url || !anonKey) return null

  browserClient = createBrowserClient(url, anonKey)
  return browserClient
}

export { isSupabaseConfigured }

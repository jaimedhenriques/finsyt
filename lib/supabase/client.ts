"use client"

import { createClient } from "@supabase/supabase-js"
import { getSupabaseConfig, hasSupabaseConfig } from "./config"

let browserClient: ReturnType<typeof createClient> | null = null

export function getSupabaseBrowserClient() {
  if (!hasSupabaseConfig()) return null
  if (browserClient) return browserClient

  const { url, anonKey } = getSupabaseConfig()
  browserClient = createClient(url, anonKey)
  return browserClient
}

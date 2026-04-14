'use client'

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from '@/lib/supabase/config'

let browserClient: SupabaseClient | null = null

export function createBrowserClient() {
  if (!isSupabaseConfigured()) return null

  if (!browserClient) {
    browserClient = createSupabaseBrowserClient(getSupabaseUrl(), getSupabaseAnonKey())
  }

  return browserClient
}

export function createClient() {
  return createBrowserClient()
}

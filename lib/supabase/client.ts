'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

type SupabaseEnv = {
  url: string
  anonKey: string
}

let browserClient: SupabaseClient | null = null

function resolveSupabaseEnv(): SupabaseEnv {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_URL ||
    ''

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY ||
    ''

  if (!url || !anonKey) {
    throw new Error(
      'Supabase browser client is not configured. Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    )
  }

  return { url, anonKey }
}

export function createClient() {
  if (browserClient) {
    return browserClient
  }

  const { url, anonKey } = resolveSupabaseEnv()
  browserClient = createBrowserClient(url, anonKey)
  return browserClient
}

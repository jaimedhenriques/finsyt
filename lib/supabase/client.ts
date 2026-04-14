'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    // Return a stub that won't crash during SSR/build when env vars are missing
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        signInWithPassword: async () => ({ data: {}, error: { message: 'Supabase not configured' } }),
        signInWithOAuth: async () => ({ data: {}, error: { message: 'Supabase not configured' } }),
        signUp: async () => ({ data: {}, error: { message: 'Supabase not configured' } }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }),
    } as any
  }

  _client = createBrowserClient(url, key)
  return _client
}

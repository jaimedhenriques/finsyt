import { createServerClient } from '@supabase/ssr'
import type { CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

type SupabaseEnv = {
  url: string
  anonKey: string
}

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
      'Supabase server client is not configured. Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    )
  }

  return { url, anonKey }
}

export async function createClient() {
  const cookieStore = await cookies()
  const { url, anonKey } = resolveSupabaseEnv()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as CookieOptions)
          })
        } catch {
          // Server Components cannot mutate cookies directly.
        }
      },
    },
  })
}

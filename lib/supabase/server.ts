import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseConfig } from '@/lib/supabase/config'

export async function createClient() {
  const cookieStore = await cookies()
  const { url, anonKey, isConfigured } = getSupabaseConfig()
  if (!isConfigured) {
    throw new Error('Supabase environment variables are not configured')
  }

  return createServerClient(url!, anonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // The server component render path may not support setting cookies.
          // Middleware handles session cookie persistence in that case.
        }
      },
    },
  })
}

import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'

import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from '@/lib/supabase/config'

type CookieAdapter = {
  getAll: () => { name: string; value: string }[]
  setAll: (
    cookiesToSet: {
      name: string
      value: string
      options?: Record<string, unknown>
    }[],
  ) => void
}

function createConfiguredServerClient(cookieAdapter: CookieAdapter): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null

  return createSupabaseServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: cookieAdapter,
  })
}

export async function createServerClient() {
  const cookieStore = await cookies()

  return createConfiguredServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options)
        })
      } catch {
        // Server Components cannot always write cookies; middleware refresh handles persistence.
      }
    },
  })
}

export function createRouteHandlerClient(request: NextRequest, response: NextResponse) {
  return createConfiguredServerClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options)
      })
    },
  })
}

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_URL!,
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY!
  )
}

const URL_CANDIDATES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "finsyt_SUPABASE_URL",
  "NEXT_PUBLIC_finsyt_finsytSUPABASE_URL",
] as const

const ANON_KEY_CANDIDATES = [
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "finsyt_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY",
  "NEXT_PUBLIC_finsyt_finsytSUPABASE_PUBLISHABLE_KEY",
] as const

function readFirst(keys: readonly string[]): string {
  for (const key of keys) {
    const value = process.env[key]
    if (value) {
      const trimmed = value.trim()
      if (trimmed.length > 0) return trimmed
    }
  }
  return ""
}

export function getSupabaseEnv() {
  const url = readFirst(URL_CANDIDATES)
  const anonKey = readFirst(ANON_KEY_CANDIDATES)
  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey),
  }
}

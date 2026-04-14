const FALLBACK_SUPABASE_URL_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_finsyt_finsytSUPABASE_URL",
  "finsyt_SUPABASE_URL",
] as const

const FALLBACK_SUPABASE_ANON_KEYS = [
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY",
  "finsyt_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_finsyt_finsytSUPABASE_PUBLISHABLE_KEY",
] as const

function readEnv(keys: readonly string[]) {
  for (const key of keys) {
    const value = process.env[key]
    if (value) return value
  }

  return ""
}

export function getSupabasePublicEnv() {
  return {
    url: readEnv(FALLBACK_SUPABASE_URL_KEYS),
    anonKey: readEnv(FALLBACK_SUPABASE_ANON_KEYS),
  }
}

export function hasSupabasePublicEnv() {
  const { url, anonKey } = getSupabasePublicEnv()
  return Boolean(url && anonKey)
}

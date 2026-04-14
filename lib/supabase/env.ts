const SUPABASE_URL_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_finsyt_finsytSUPABASE_URL",
  "finsyt_SUPABASE_URL",
] as const

const SUPABASE_ANON_KEYS = [
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY",
  "finsyt_SUPABASE_ANON_KEY",
] as const

function firstEnvValue(keys: readonly string[]): string {
  for (const key of keys) {
    const value = process.env[key]
    if (value && value.trim()) return value
  }
  return ""
}

export function getSupabaseEnv() {
  const url = firstEnvValue(SUPABASE_URL_KEYS)
  const anonKey = firstEnvValue(SUPABASE_ANON_KEYS)
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export function requireSupabaseEnv() {
  const env = getSupabaseEnv()
  if (env) return env

  throw new Error(
    "Supabase credentials are missing. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  )
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseEnv())
}


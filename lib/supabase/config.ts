export type SupabasePublicEnv = {
  url: string
  anonKey: string
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  return {
    url:
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_URL ||
      "",
    anonKey:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY ||
      "",
  }
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabasePublicEnv()
  return Boolean(url && anonKey)
}

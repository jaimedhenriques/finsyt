export function getSupabaseConfig() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_URL
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY

  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey),
  }
}

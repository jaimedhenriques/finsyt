const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.finsyt_SUPABASE_URL ||
  ""

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.finsyt_SUPABASE_ANON_KEY ||
  ""

export function getSupabaseUrl() {
  return supabaseUrl
}

export function getSupabaseAnonKey() {
  return supabaseAnonKey
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

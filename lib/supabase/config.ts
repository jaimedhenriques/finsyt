export type SupabaseConfig = {
  url: string
  anonKey: string
}

function firstValue(...values: Array<string | undefined>): string {
  return values.find((value) => typeof value === "string" && value.length > 0) || ""
}

export function getSupabaseConfig(): SupabaseConfig {
  const url = firstValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_URL,
  )

  const anonKey = firstValue(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_PUBLISHABLE_KEY,
  )

  return { url, anonKey }
}

export function hasSupabaseConfig(): boolean {
  const { url, anonKey } = getSupabaseConfig()
  return Boolean(url && anonKey)
}

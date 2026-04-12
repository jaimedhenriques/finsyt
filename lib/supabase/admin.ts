import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseEnv } from "@/lib/supabase/env"

let adminClient: SupabaseClient | null = null

export function getSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient

  const { url, serviceRoleKey } = getSupabaseEnv()

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service role configuration is missing.")
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return adminClient
}

'use client'

import { useSupabaseAuth } from '@/lib/supabase/provider'

export function useSession() {
  return useSupabaseAuth().session
}

export function useUser() {
  return useSupabaseAuth().user
}

export function useSupabaseClient() {
  return useSupabaseAuth().supabase
}

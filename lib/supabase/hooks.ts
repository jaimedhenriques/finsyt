"use client"

import { useContext, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { AuthContext } from "@/lib/supabase/context"

function useAuthContext() {
  return useContext(AuthContext)
}

export function useSession() {
  return useAuthContext().session
}

export function useUser() {
  return useAuthContext().user
}

export function useSupabaseClient() {
  return useMemo(() => createClient(), [])
}

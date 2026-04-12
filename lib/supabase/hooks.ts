"use client"

import { useMemo } from "react"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

export function useSupabaseBrowserClient() {
  return useMemo(() => createSupabaseBrowserClient(), [])
}

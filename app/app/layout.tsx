import type { ReactNode } from "react"

import AppFrame from "@/components/AppFrame"
import { SupabaseSessionProvider } from "@/lib/supabase/hooks"
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server"

export default async function AppLayout({ children }: { children: ReactNode }) {
  let initialSession = null

  if (hasSupabaseServerEnv()) {
    const supabase = await createSupabaseServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    initialSession = session
  }

  return (
    <SupabaseSessionProvider initialSession={initialSession}>
      <AppFrame>{children}</AppFrame>
    </SupabaseSessionProvider>
  )
}

import AppLayoutShell from '@/components/AppLayoutShell'
import { createClient } from '@/lib/supabase/server'
import type { Session } from '@supabase/supabase-js'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let initialSession: Session | null = null

  try {
    const supabase = await createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    initialSession = session ?? null
  } catch {
    // Gracefully continue when Supabase env vars are not configured.
  }

  return <AppLayoutShell initialSession={initialSession}>{children}</AppLayoutShell>
}

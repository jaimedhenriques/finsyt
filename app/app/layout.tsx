import AppShell from '@/components/AppShell'
import { SessionProvider } from '@/lib/supabase/hooks'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseConfig } from '@/lib/supabase/config'
import type { Session } from '@supabase/supabase-js'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { isConfigured } = getSupabaseConfig()
  let session: Session | null = null

  if (isConfigured) {
    const supabase = await createClient()
    const {
      data: { session: nextSession },
    } = await supabase.auth.getSession()
    session = nextSession
  }

  return (
    <SessionProvider initialSession={session}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  )
}

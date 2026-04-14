import AppShell from '@/components/AppShell'
import { SessionProvider } from '@/lib/supabase/session-provider'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let initialSession = null

  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getSession()
    initialSession = data.session ?? null
  } catch {
    // If Supabase is not configured in an environment, the app shell still renders.
  }

  return (
    <SessionProvider initialSession={initialSession}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  )
}

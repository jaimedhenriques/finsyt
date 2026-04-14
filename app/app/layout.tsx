import AppShell from '@/components/AppShell'
import { SupabaseAuthProvider } from '@/lib/supabase/provider'
import { createServerClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const session = supabase ? (await supabase.auth.getSession()).data.session : null

  return (
    <SupabaseAuthProvider initialSession={session}>
      <AppShell>{children}</AppShell>
    </SupabaseAuthProvider>
  )
}

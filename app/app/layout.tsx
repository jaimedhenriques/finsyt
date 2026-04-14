import AppShell from "@/components/AppShell"
import { AuthProvider } from "@/lib/supabase/context"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const session = supabase
    ? (await supabase.auth.getSession()).data.session
    : null

  return (
    <AuthProvider value={{ user: session?.user ?? null, session }}>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  )
}

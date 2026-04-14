import AppLayoutFrame from "@/components/AppLayoutFrame"
import { SessionProvider } from "@/lib/supabase/hooks"
import { createClient } from "@/lib/supabase/server"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { session },
  } = supabase ? await supabase.auth.getSession() : { data: { session: null } }

  return (
    <SessionProvider initialSession={session}>
      <AppLayoutFrame>{children}</AppLayoutFrame>
    </SessionProvider>
  )
}

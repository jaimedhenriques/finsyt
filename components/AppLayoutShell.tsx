'use client'

import AppShell from '@/components/AppShell'
import { SessionProvider } from '@/lib/supabase/session-provider'
import type { Session } from '@supabase/supabase-js'

export default function AppLayoutShell({
  children,
  initialSession = null,
}: {
  children: React.ReactNode
  initialSession?: Session | null
}) {
  return (
    <SessionProvider initialSession={initialSession}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  )
}

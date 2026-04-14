'use client'

import { createClient, isSupabaseBrowserConfigured } from '@/lib/supabase/client'
import type { Session, User } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type SessionContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({
  initialSession,
  children,
}: {
  initialSession: Session | null
  children: React.ReactNode
}) {
  const supabaseConfigured = isSupabaseBrowserConfigured()
  const [session, setSession] = useState<Session | null>(initialSession)
  const [loading, setLoading] = useState(
    !initialSession && supabaseConfigured,
  )

  useEffect(() => {
    if (!supabaseConfigured) {
      return
    }

    const supabase = createClient()

    // Keep client state synced with auth changes (including token refreshes).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabaseConfigured])

  const value = useMemo<SessionContextValue>(
    () => ({ session, user: session?.user ?? null, loading }),
    [loading, session],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSessionContext() {
  return useContext(SessionContext)
}

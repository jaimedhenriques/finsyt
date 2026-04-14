'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Session, User } from '@supabase/supabase-js'

type SessionContextValue = {
  session: Session | null
  user: User | null
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  user: null,
})

export function SessionProvider({
  initialSession,
  children,
}: {
  initialSession: Session | null
  children: React.ReactNode
}) {
  const supabase = useMemo(() => createClient(), [])
  const [session, setSession] = useState<Session | null>(initialSession)
  const [user, setUser] = useState<User | null>(initialSession?.user ?? null)

  useEffect(() => {
    setSession(initialSession)
    setUser(initialSession?.user ?? null)
  }, [initialSession])

  useEffect(() => {
    if (!supabase) {
      return
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const value = useMemo(() => ({ session, user }), [session, user])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  return useContext(SessionContext).session
}

export function useUser() {
  return useContext(SessionContext).user
}

'use client'

import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'

type SupabaseAuthContextValue = {
  supabase: SupabaseClient | null
  session: Session | null
  user: User | null
  isConfigured: boolean
  isLoading: boolean
}

const SupabaseAuthContext = createContext<SupabaseAuthContextValue | undefined>(undefined)

export function SupabaseAuthProvider({
  children,
  initialSession,
}: {
  children: React.ReactNode
  initialSession: Session | null
}) {
  const supabase = useMemo(() => createClient(), [])
  const [session, setSession] = useState<Session | null>(initialSession)
  const [isLoading, setIsLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false)
      return
    }

    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setSession(data.session ?? initialSession)
      setIsLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [initialSession, supabase])

  return (
    <SupabaseAuthContext.Provider
      value={{
        supabase,
        session,
        user: session?.user ?? null,
        isConfigured: isSupabaseConfigured(),
        isLoading,
      }}
    >
      {children}
    </SupabaseAuthContext.Provider>
  )
}

export function useSupabaseAuth() {
  const context = useContext(SupabaseAuthContext)

  if (!context) {
    throw new Error('useSupabaseAuth must be used within a SupabaseAuthProvider')
  }

  return context
}

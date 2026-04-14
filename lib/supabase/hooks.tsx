'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Session, SupabaseClient, User } from "@supabase/supabase-js"

import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { hasSupabasePublicEnv } from "@/lib/supabase/config"

type SupabaseSessionContextValue = {
  isConfigured: boolean
  isLoading: boolean
  session: Session | null
  supabase: SupabaseClient | null
  user: User | null
}

const SupabaseSessionContext = createContext<SupabaseSessionContextValue | undefined>(undefined)

export function SupabaseSessionProvider({
  children,
  initialSession,
}: {
  children: ReactNode
  initialSession: Session | null
}) {
  const isConfigured = hasSupabasePublicEnv()
  const [supabase] = useState<SupabaseClient | null>(() => {
    if (!isConfigured) return null
    return createSupabaseBrowserClient()
  })
  const [session, setSession] = useState<Session | null>(initialSession)
  const [hasResolvedSession, setHasResolvedSession] = useState(Boolean(!isConfigured || initialSession))

  useEffect(() => {
    if (!supabase) return

    let isMounted = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return

      if (!error) {
        setSession(data.session)
      }

      setHasResolvedSession(true)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setHasResolvedSession(true)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  const isLoading = isConfigured && !hasResolvedSession

  const value = useMemo<SupabaseSessionContextValue>(
    () => ({
      isConfigured,
      isLoading,
      session,
      supabase,
      user: session?.user ?? null,
    }),
    [isConfigured, isLoading, session, supabase],
  )

  return <SupabaseSessionContext.Provider value={value}>{children}</SupabaseSessionContext.Provider>
}

function useSupabaseSessionContext() {
  const context = useContext(SupabaseSessionContext)

  if (!context) {
    throw new Error("SupabaseSessionProvider is missing from the React tree.")
  }

  return context
}

export function useSession() {
  return useSupabaseSessionContext().session
}

export function useUser() {
  return useSupabaseSessionContext().user
}

export function useSupabaseBrowser() {
  return useSupabaseSessionContext().supabase
}

export function useSupabaseAuthState() {
  return useSupabaseSessionContext()
}

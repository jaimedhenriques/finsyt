'use client'

import type { Session, SupabaseClient, User } from "@supabase/supabase-js"
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"

type SessionContextValue = {
  client: SupabaseClient | null
  session: Session | null
  user: User | null
  loading: boolean
  isConfigured: boolean
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined)

type SessionProviderProps = {
  children: ReactNode
  initialSession?: Session | null
}

export function SessionProvider({ children, initialSession = null }: SessionProviderProps) {
  const router = useRouter()
  const client = useMemo(() => createClient(), [])
  const [session, setSession] = useState<Session | null>(initialSession)
  const [loading, setLoading] = useState(Boolean(client) && !initialSession)

  useEffect(() => {
    if (!client) return

    let mounted = true

    client.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session ?? initialSession)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
      router.refresh()
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [client, initialSession, router])

  const value = useMemo<SessionContextValue>(
    () => ({
      client,
      session,
      user: session?.user ?? null,
      loading,
      isConfigured: Boolean(client),
    }),
    [client, loading, session],
  )

  return createElement(SessionContext.Provider, { value }, children)
}

function useSessionContext(): SessionContextValue {
  const context = useContext(SessionContext)

  if (!context) {
    throw new Error("Supabase session hooks must be used inside SessionProvider.")
  }

  return context
}

export function useSupabaseClient(): SupabaseClient | null {
  return useSessionContext().client
}

export function useSession(): Session | null {
  return useSessionContext().session
}

export function useUser(): User | null {
  return useSessionContext().user
}

export function useSessionStatus(): Pick<SessionContextValue, "loading" | "isConfigured"> {
  const { loading, isConfigured } = useSessionContext()
  return { loading, isConfigured }
}

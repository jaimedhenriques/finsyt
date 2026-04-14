'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import type { User, Session } from '@supabase/supabase-js'

type AuthContextType = {
  user: User | null
  session: Session | null
  loading: boolean
  subscription: { plan: string; status: string } | null
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  subscription: null,
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode
  initialUser?: User | null
}) {
  const [user, setUser] = useState<User | null>(initialUser ?? null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!initialUser)
  const [subscription, setSubscription] = useState<{ plan: string; status: string } | null>(null)
  const clientRef = useRef<any>(null)

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      setLoading(false)
      return
    }

    import('@supabase/ssr').then(({ createBrowserClient }) => {
      const supabase = createBrowserClient(url, key)
      clientRef.current = supabase

      supabase.auth.getSession().then(({ data }: any) => {
        setSession(data.session)
        setUser(data.session?.user ?? initialUser ?? null)
        setLoading(false)
      })

      const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
        (_event: any, session: any) => {
          setSession(session)
          setUser(session?.user ?? null)
        },
      )

      return () => authSub.unsubscribe()
    }).catch(() => {
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!user || !clientRef.current) {
      setSubscription(user ? { plan: 'free', status: 'active' } : null)
      return
    }

    clientRef.current
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
      .then(({ data }: any) => {
        setSubscription(data ?? { plan: 'free', status: 'active' })
      })
  }, [user])

  return (
    <AuthContext.Provider value={{ user, session, loading, subscription }}>
      {children}
    </AuthContext.Provider>
  )
}

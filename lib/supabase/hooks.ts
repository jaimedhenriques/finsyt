'use client'

import { useEffect, useState, useCallback } from 'react'
import type { User, Session } from '@supabase/supabase-js'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  const { createBrowserClient } = require('@supabase/ssr')
  return createBrowserClient(url, key)
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getClient()
    if (!supabase) { setLoading(false); return }

    supabase.auth.getUser().then(({ data }: any) => {
      setUser(data.user)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, loading }
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getClient()
    if (!supabase) { setLoading(false); return }

    supabase.auth.getSession().then(({ data }: any) => {
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  return { session, loading }
}

export function useSignOut() {
  return useCallback(async () => {
    const supabase = getClient()
    if (supabase) await supabase.auth.signOut()
    window.location.href = '/app/auth/login'
  }, [])
}

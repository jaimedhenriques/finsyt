'use client'
import { useEffect, useState } from 'react'
import { createClient } from './client'
import type { User, Session } from '@supabase/supabase-js'

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
    const supabase = createClient()

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  return { session, loading }
}

export function useSubscription() {
  const { user, loading: userLoading } = useUser()
  const [plan, setPlan] = useState<'free' | 'pro' | 'enterprise' | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (userLoading) return
    if (!user) { setPlan(null); setLoading(false); return }

    fetch('/api/subscription')
      .then(r => r.json())
      .then(data => { setPlan(data.plan ?? 'free'); setLoading(false) })
      .catch(() => { setPlan('free'); setLoading(false) })
  }, [user, userLoading])

  return { plan, loading, isPro: plan === 'pro' || plan === 'enterprise' }
}

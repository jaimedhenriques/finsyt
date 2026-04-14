'use client'

import { createClient } from '@/lib/supabase/client'
import type { Session, User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    let mounted = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) {
        return
      }
      if (!error) {
        setSession(data.session ?? null)
      }
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { session, loading }
}

export function useUser(): { user: User | null; loading: boolean } {
  const { session, loading } = useSession()
  return { user: session?.user ?? null, loading }
}

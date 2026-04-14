'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AuthActions() {
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/app/auth/login')
    router.refresh()
  }

  return (
    <button
      onClick={signOut}
      style={{
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid #E2E8F2',
        background: '#ffffff',
        color: '#4A5568',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      Sign out
    </button>
  )
}

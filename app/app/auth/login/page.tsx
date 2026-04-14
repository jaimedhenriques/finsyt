'use client'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, useMemo, useState } from 'react'

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  padding: '2rem',
  borderRadius: 12,
  border: '1px solid #E2E8F2',
  background: '#ffffff',
  boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
}

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('next') || '/app'
  const callbackBase = useMemo(() => {
    if (typeof window !== 'undefined') {
      return window.location.origin
    }
    return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  }, [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(signInError.message)
        return
      }

      router.push(redirectTo)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function signInWithGoogle() {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${callbackBase}/app/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        },
      })

      if (oauthError) {
        setError(oauthError.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F5F7FB',
        padding: '1rem',
      }}
    >
      <div style={cardStyle}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: '#0A1628' }}>Log in</h1>
        <p style={{ color: '#64748B', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
          Continue to your Finsyt workspace.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
          <label style={{ display: 'grid', gap: '0.375rem', fontSize: '0.875rem', color: '#334155' }}>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input"
              placeholder="name@company.com"
            />
          </label>
          <label style={{ display: 'grid', gap: '0.375rem', fontSize: '0.875rem', color: '#334155' }}>
            Password
            <input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input"
              placeholder="••••••••"
            />
          </label>
          {error ? (
            <p style={{ color: '#DC2626', fontSize: '0.85rem', marginTop: '0.25rem' }}>{error}</p>
          ) : null}
          <button disabled={loading} className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '0.5rem' }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div style={{ margin: '1rem 0', textAlign: 'center', color: '#94A3B8', fontSize: '0.8rem' }}>OR</div>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
          className="btn btn-outline"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Continue with Google
        </button>

        <p style={{ marginTop: '1.25rem', fontSize: '0.9rem', color: '#64748B' }}>
          New here?{' '}
          <Link href={`/app/auth/signup?next=${encodeURIComponent(redirectTo)}`} style={{ color: '#1B4FFF', fontWeight: 600 }}>
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}

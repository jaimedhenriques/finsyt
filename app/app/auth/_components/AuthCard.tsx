'use client'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

type AuthCardProps = {
  mode: 'login' | 'signup'
}

export default function AuthCard({ mode }: AuthCardProps) {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const title = mode === 'login' ? 'Welcome back' : 'Create your account'
  const submitLabel = mode === 'login' ? 'Sign in' : 'Sign up'
  const alternateHref = mode === 'login' ? '/app/auth/signup' : '/app/auth/login'
  const alternateLabel =
    mode === 'login'
      ? "Don't have an account? Create one"
      : 'Already have an account? Sign in'

  const rawNextPath = searchParams.get('next') || '/app/research'
  const nextPath =
    rawNextPath.startsWith('/') && !rawNextPath.startsWith('//')
      ? rawNextPath
      : '/app/research'
  const isSupabaseConfigured = Boolean(supabase)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (!supabase) {
        setError('Authentication is not configured. Set Supabase environment variables first.')
        return
      }

      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) {
          setError(signInError.message)
          return
        }

        router.replace(nextPath)
        router.refresh()
        return
      }

      const origin = window.location.origin
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/app/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      setMessage('Check your email to confirm your account, then return to sign in.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleOAuth() {
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (!supabase) {
        setError('Authentication is not configured. Set Supabase environment variables first.')
        return
      }

      const origin = window.location.origin
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/app/auth/callback?next=${encodeURIComponent(nextPath)}`,
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
        background: '#F5F7FB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 420,
          padding: '2rem',
          boxShadow: '0 16px 40px rgba(10,22,40,0.08)',
        }}
      >
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 className="page-title" style={{ marginBottom: '0.5rem' }}>
            {title}
          </h1>
          <p style={{ color: '#5F7394', fontSize: '0.9rem' }}>
            Institutional-grade financial intelligence platform access.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span className="label">Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              placeholder="you@company.com"
              disabled={loading || !isSupabaseConfigured}
            />
          </label>

          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span className="label">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              disabled={loading || !isSupabaseConfigured}
            />
          </label>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading || !isSupabaseConfigured}
          >
            {loading ? 'Processing…' : submitLabel}
          </button>
        </form>

        <div style={{ marginTop: '0.75rem' }}>
          <button
            className="btn btn-outline"
            onClick={handleGoogleOAuth}
            type="button"
            disabled={loading || !isSupabaseConfigured}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Continue with Google
          </button>
        </div>

        {!isSupabaseConfigured && (
          <p
            style={{
              marginTop: '1rem',
              fontSize: '0.85rem',
              color: '#92400E',
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: 8,
              padding: '0.65rem 0.75rem',
            }}
          >
            Supabase credentials are missing. Configure `NEXT_PUBLIC_SUPABASE_URL` and
            `NEXT_PUBLIC_SUPABASE_ANON_KEY` to enable authentication.
          </p>
        )}

        {error && (
          <p
            style={{
              marginTop: '1rem',
              fontSize: '0.85rem',
              color: '#DC2626',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 8,
              padding: '0.65rem 0.75rem',
            }}
          >
            {error}
          </p>
        )}

        {message && (
          <p
            style={{
              marginTop: '1rem',
              fontSize: '0.85rem',
              color: '#065F46',
              background: '#ECFDF5',
              border: '1px solid #A7F3D0',
              borderRadius: 8,
              padding: '0.65rem 0.75rem',
            }}
          >
            {message}
          </p>
        )}

        <p style={{ marginTop: '1rem', fontSize: '0.84rem', color: '#5F7394' }}>
          <Link href={alternateHref} style={{ color: '#1B4FFF', fontWeight: 600 }}>
            {alternateLabel}
          </Link>
        </p>
      </div>
    </div>
  )
}

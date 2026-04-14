'use client'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, useMemo, useState } from 'react'

export default function SignupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/app'
  const supabase = useMemo(() => createClient(), [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    const origin =
      typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL
    const emailRedirectTo = `${origin ?? ''}/app/auth/callback?next=${encodeURIComponent(
      redirectTo,
    )}`

    const { error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    })
    setLoading(false)

    if (signupError) {
      setError(signupError.message)
      return
    }

    setMessage('Check your inbox to confirm your email, then sign in.')
  }

  async function handleGoogleSignup() {
    setError(null)
    setLoading(true)
    const origin =
      typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL
    const oauthRedirectTo = `${origin ?? ''}/app/auth/callback?next=${encodeURIComponent(
      redirectTo,
    )}`

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: oauthRedirectTo },
    })
    setLoading(false)
    if (oauthError) {
      setError(oauthError.message)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: '#F5F7FB',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 420,
          padding: '1.5rem',
          borderRadius: 14,
          boxShadow: '0 14px 30px rgba(8, 14, 26, 0.08)',
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0A1628', marginBottom: 6 }}>
          Create your account
        </h1>
        <p style={{ fontSize: 13, color: '#7D8FA9', marginBottom: 18 }}>
          Start your Finsyt workspace with secure authentication.
        </p>

        <form onSubmit={handleSignup} style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4A5568' }}>Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4A5568' }}>Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4A5568' }}>Confirm password</span>
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ justifyContent: 'center', marginTop: 4 }}
          >
            {loading ? 'Creating account…' : 'Sign up'}
          </button>
        </form>

        <button
          className="btn btn-outline"
          type="button"
          onClick={handleGoogleSignup}
          disabled={loading}
          style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
        >
          Continue with Google
        </button>

        {error && (
          <p style={{ marginTop: 12, fontSize: 12, color: '#DC2626', fontWeight: 600 }}>{error}</p>
        )}
        {message && (
          <p style={{ marginTop: 12, fontSize: 12, color: '#059669', fontWeight: 600 }}>
            {message}
          </p>
        )}

        <p style={{ marginTop: 12, fontSize: 12, color: '#7D8FA9' }}>
          Already have an account?{' '}
          <Link
            href={`/app/auth/login?redirect=${encodeURIComponent(redirectTo)}`}
            style={{ color: '#1B4FFF', fontWeight: 700 }}
          >
            Sign in
          </Link>
        </p>

        <button
          type="button"
          onClick={() => router.push('/')}
          style={{
            marginTop: 10,
            border: 'none',
            background: 'transparent',
            color: '#1B4FFF',
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: 600,
            padding: 0,
          }}
        >
          Back to homepage
        </button>
      </div>
    </div>
  )
}

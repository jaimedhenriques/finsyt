'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
export default function LoginPage() {
  function getSupabase() {
    const { createClient } = require('@/lib/supabase/client')
    return createClient()
  }
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/app')
    router.refresh()
  }

  async function handleGoogleLogin() {
    setError(null)
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/app/auth/callback`,
      },
    })
    if (error) setError(error.message)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #080E1A 0%, #0D1B2E 50%, #0A1628 100%)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        padding: '2.5rem',
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg, #1B4FFF, #0D9FE8)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, color: '#fff', fontSize: 20, marginBottom: 16,
          }}>F</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0A1628', letterSpacing: '-0.03em', marginBottom: 4 }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 14, color: '#7D8FA9' }}>Sign in to your Finsyt account</p>
        </div>

        {/* Google OAuth */}
        <button
          onClick={handleGoogleLogin}
          style={{
            width: '100%', height: 44, borderRadius: 10,
            border: '1.5px solid #E2E8F2', background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#1C2B4A',
            fontFamily: 'inherit', transition: 'border-color 0.15s, background 0.15s',
            marginBottom: 20,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#1B4FFF'; e.currentTarget.style.background = '#F8FAFD' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F2'; e.currentTarget.style.background = '#fff' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: '#E2E8F2' }} />
          <span style={{ fontSize: 12, color: '#9BAFC8', fontWeight: 500 }}>or</span>
          <div style={{ flex: 1, height: 1, background: '#E2E8F2' }} />
        </div>

        {/* Email form */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1C2B4A', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                width: '100%', height: 42, borderRadius: 10,
                border: '1.5px solid #E2E8F2', padding: '0 14px',
                fontSize: 14, color: '#1C2B4A', fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#1B4FFF'}
              onBlur={e => e.currentTarget.style.borderColor = '#E2E8F2'}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1C2B4A', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%', height: 42, borderRadius: 10,
                border: '1.5px solid #E2E8F2', padding: '0 14px',
                fontSize: 14, color: '#1C2B4A', fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#1B4FFF'}
              onBlur={e => e.currentTarget.style.borderColor = '#E2E8F2'}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 16,
              background: '#FEF2F2', border: '1px solid #FECACA',
              fontSize: 13, color: '#DC2626',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', height: 44, borderRadius: 10,
              background: loading ? '#93B4FF' : 'linear-gradient(135deg, #1B4FFF, #0D9FE8)',
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#7D8FA9' }}>
          Don&apos;t have an account?{' '}
          <Link href="/app/auth/signup" style={{ color: '#1B4FFF', fontWeight: 600, textDecoration: 'none' }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}

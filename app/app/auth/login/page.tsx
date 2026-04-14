'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/app/research')
      router.refresh()
    }
  }

  async function handleGoogleLogin() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #080E1A 0%, #0F1B2E 50%, #0A1220 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      padding: 24,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: '#0D1525',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '48px 40px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg, #1B4FFF, #0D9FE8)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, color: '#fff', fontSize: 20, marginBottom: 16,
          }}>F</div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>
            Welcome back
          </h1>
          <p style={{ color: '#6B7F9B', fontSize: 14, margin: 0 }}>
            Sign in to Finsyt Intelligence
          </p>
        </div>

        {/* Google OAuth */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            color: '#E2E8F2',
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontFamily: 'inherit',
            transition: 'all 0.15s',
            opacity: loading ? 0.6 : 1,
            marginBottom: 24,
          }}
          onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'}
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
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24,
        }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ color: '#4A5568', fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9BAFC8', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)', color: '#E2E8F2',
                fontSize: 14, fontFamily: 'inherit', outline: 'none',
                boxSizing: 'border-box', transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#1B4FFF'}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9BAFC8', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)', color: '#E2E8F2',
                fontSize: 14, fontFamily: 'inherit', outline: 'none',
                boxSizing: 'border-box', transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#1B4FFF'}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 16,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#FCA5A5', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 12,
              background: 'linear-gradient(135deg, #1B4FFF, #0D9FE8)',
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#6B7F9B' }}>
          Don&apos;t have an account?{' '}
          <Link href="/app/auth/signup" style={{ color: '#1B4FFF', fontWeight: 600, textDecoration: 'none' }}>
            Create account
          </Link>
        </p>
      </div>
    </div>
  )
}

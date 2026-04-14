'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [oauthLoading, setOauthLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) { setError('Please enter email and password.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/app/auth/callback`,
      },
    })
    if (error) { setError(error.message); setLoading(false); return }
    setSuccess('Check your email to confirm your account, then sign in.')
    setLoading(false)
  }

  async function handleGoogleSignup() {
    setOauthLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app/auth/callback` },
    })
    if (error) { setError(error.message); setOauthLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080E1A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 18 }}>F</div>
            <span style={{ fontWeight: 800, fontSize: '1.375rem', letterSpacing: '-0.02em', color: '#fff' }}>Finsyt</span>
          </Link>
          <p style={{ marginTop: 12, color: '#7A8EAE', fontSize: 14 }}>Start your free account today</p>
        </div>

        <div style={{ background: '#0D1627', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '36px 32px' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: 6, letterSpacing: '-0.02em' }}>Create your account</h1>
          <p style={{ fontSize: 14, color: '#7A8EAE', marginBottom: 28 }}>Free forever · No credit card required</p>

          {success ? (
            <div style={{ padding: '20px', borderRadius: 12, background: 'rgba(5,150,105,0.12)', border: '1px solid rgba(5,150,105,0.25)', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>✉️</div>
              <p style={{ color: '#6EE7B7', fontSize: 14, lineHeight: 1.6 }}>{success}</p>
              <Link href="/app/auth/login" style={{ display: 'inline-block', marginTop: 16, padding: '10px 24px', borderRadius: 10, background: 'rgba(5,150,105,0.25)', color: '#6EE7B7', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Go to Sign In</Link>
            </div>
          ) : (
            <>
              <button
                onClick={handleGoogleSignup}
                disabled={oauthLoading}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#E2E8F0', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20, fontFamily: 'inherit', transition: 'all 0.15s', opacity: oauthLoading ? 0.7 : 1 }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                {oauthLoading ? 'Connecting...' : 'Sign up with Google'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                <span style={{ fontSize: 12, color: '#3D5270', fontWeight: 600 }}>OR</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
              </div>

              <form onSubmit={handleSignup}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#7A8EAE', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Jane Smith"
                    autoComplete="name"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#E2E8F0', fontSize: 14, fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.15s' }}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#1B4FFF'}
                    onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#7A8EAE', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    required
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#E2E8F0', fontSize: 14, fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.15s' }}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#1B4FFF'}
                    onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#7A8EAE', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                    required
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#E2E8F0', fontSize: 14, fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.15s' }}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#1B4FFF'}
                    onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>

                {error && (
                  <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5', fontSize: 13, marginBottom: 16 }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #1B4FFF, #0D9FE8)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s', letterSpacing: '-0.01em' }}
                >
                  {loading ? 'Creating account...' : 'Create Free Account'}
                </button>
              </form>
            </>
          )}

          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#7A8EAE' }}>
            Already have an account?{' '}
            <Link href="/app/auth/login" style={{ color: '#93B4FF', textDecoration: 'none', fontWeight: 600 }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

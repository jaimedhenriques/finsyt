'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!email) { setError('Please enter your email.'); return }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/app/auth/callback?next=/app/auth/update-password`,
    })
    if (error) { setError(error.message); setLoading(false); return }
    setSent(true)
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080E1A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 18 }}>F</div>
            <span style={{ fontWeight: 800, fontSize: '1.375rem', letterSpacing: '-0.02em', color: '#fff' }}>Finsyt</span>
          </Link>
        </div>

        <div style={{ background: '#0D1627', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '36px 32px' }}>
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>📧</div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#fff', marginBottom: 10 }}>Check your email</h2>
              <p style={{ fontSize: 14, color: '#7A8EAE', lineHeight: 1.6, marginBottom: 24 }}>We sent a password reset link to <strong style={{ color: '#93B4FF' }}>{email}</strong></p>
              <Link href="/app/auth/login" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 10, background: 'linear-gradient(135deg, #1B4FFF, #0D9FE8)', color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Back to Sign In</Link>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: 8, letterSpacing: '-0.02em' }}>Reset your password</h1>
              <p style={{ fontSize: 14, color: '#7A8EAE', marginBottom: 28 }}>We&apos;ll send a reset link to your email.</p>
              <form onSubmit={handleReset}>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#7A8EAE', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#E2E8F0', fontSize: 14, fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.15s' }}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#1B4FFF'}
                    onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>
                {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5', fontSize: 13, marginBottom: 16 }}>{error}</div>}
                <button type="submit" disabled={loading} style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #1B4FFF, #0D9FE8)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
              <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#7A8EAE' }}>
                <Link href="/app/auth/login" style={{ color: '#93B4FF', textDecoration: 'none', fontWeight: 600 }}>← Back to Sign In</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { type CSSProperties, type FormEvent, useMemo, useState } from 'react'

import { useSupabaseAuth } from '@/lib/supabase/provider'

type AuthMode = 'login' | 'signup'

const theme = {
  bg: '#080E1A',
  surface: '#0F1929',
  border: 'rgba(255,255,255,0.08)',
  text: '#E2E8F0',
  textMuted: 'rgba(255,255,255,0.45)',
  textSubtle: 'rgba(255,255,255,0.65)',
  accent: '#1B4FFF',
  accentSoft: 'rgba(27,79,255,0.16)',
  danger: '#F87171',
  success: '#34D399',
}

function sanitizeNextPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith('/app')) return '/app/research'
  return nextPath
}

function getFriendlyErrorMessage(error: string | null) {
  if (!error) return null

  switch (error) {
    case 'auth_not_configured':
      return 'Authentication is not configured in this environment yet.'
    case 'missing_code':
      return 'The sign-in callback did not include an authorization code.'
    default:
      return error.replaceAll('+', ' ')
  }
}

export default function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { supabase, isConfigured } = useSupabaseAuth()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pendingAction, setPendingAction] = useState<'email' | 'google' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const nextPath = useMemo(() => sanitizeNextPath(searchParams.get('next')), [searchParams])
  const callbackUrl =
    typeof window === 'undefined'
      ? undefined
      : `${window.location.origin}/app/auth/callback?next=${encodeURIComponent(nextPath)}`

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!supabase || !isConfigured || !callbackUrl) {
      setErrorMessage('Authentication is not configured in this environment yet.')
      return
    }

    setPendingAction('email')

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error

        router.replace(nextPath)
        router.refresh()
        return
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: callbackUrl,
        },
      })

      if (error) throw error

      if (data.session) {
        router.replace(nextPath)
        router.refresh()
        return
      }

      setSuccessMessage('Check your email to confirm your account and finish signing in.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      setErrorMessage(message)
    } finally {
      setPendingAction(null)
    }
  }

  async function handleGoogleAuth() {
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!supabase || !isConfigured || !callbackUrl) {
      setErrorMessage('Authentication is not configured in this environment yet.')
      return
    }

    setPendingAction('google')

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error) {
      setErrorMessage(error.message)
      setPendingAction(null)
    }
  }

  const title = mode === 'login' ? 'Welcome back' : 'Create your account'
  const description =
    mode === 'login'
      ? 'Sign in to continue into your financial intelligence workspace.'
      : 'Get started with a secure workspace for research, data, and workflows.'
  const submitLabel = mode === 'login' ? 'Sign in' : 'Create account'
  const switchHref = mode === 'login' ? `/app/auth/signup?next=${encodeURIComponent(nextPath)}` : `/app/auth/login?next=${encodeURIComponent(nextPath)}`
  const switchLabel = mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'
  const queryError = getFriendlyErrorMessage(searchParams.get('error'))

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 440,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 24,
        boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
        padding: 32,
        color: theme.text,
      }}
    >
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 999,
            background: theme.accentSoft,
            border: `1px solid ${theme.border}`,
            color: '#93B4FF',
            fontSize: 12,
            fontWeight: 700,
            padding: '6px 12px',
            marginBottom: 18,
          }}
        >
          Secure access
        </div>
        <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.05, letterSpacing: '-0.04em' }}>{title}</h1>
        <p style={{ marginTop: 12, marginBottom: 0, color: theme.textSubtle, fontSize: 15, lineHeight: 1.6 }}>{description}</p>
      </div>

      {queryError && (
        <div
          style={{
            marginBottom: 16,
            borderRadius: 14,
            border: `1px solid rgba(248,113,113,0.35)`,
            background: 'rgba(248,113,113,0.12)',
            color: '#FECACA',
            fontSize: 13,
            lineHeight: 1.5,
            padding: '12px 14px',
          }}
        >
          {queryError}
        </div>
      )}

      {!isConfigured && (
        <div
          style={{
            marginBottom: 16,
            borderRadius: 14,
            border: `1px solid rgba(251,191,36,0.35)`,
            background: 'rgba(251,191,36,0.12)',
            color: '#FDE68A',
            fontSize: 13,
            lineHeight: 1.5,
            padding: '12px 14px',
          }}
        >
          Add the public Supabase URL and anon key to enable live authentication in this environment.
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            marginBottom: 16,
            borderRadius: 14,
            border: `1px solid rgba(248,113,113,0.35)`,
            background: 'rgba(248,113,113,0.12)',
            color: '#FECACA',
            fontSize: 13,
            lineHeight: 1.5,
            padding: '12px 14px',
          }}
        >
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div
          style={{
            marginBottom: 16,
            borderRadius: 14,
            border: `1px solid rgba(52,211,153,0.35)`,
            background: 'rgba(52,211,153,0.12)',
            color: '#A7F3D0',
            fontSize: 13,
            lineHeight: 1.5,
            padding: '12px 14px',
          }}
        >
          {successMessage}
        </div>
      )}

      <button
        type="button"
        onClick={handleGoogleAuth}
        disabled={pendingAction !== null || !isConfigured}
        style={{
          width: '100%',
          height: 48,
          borderRadius: 14,
          border: `1px solid ${theme.border}`,
          background: '#ffffff',
          color: '#111827',
          fontSize: 14,
          fontWeight: 700,
          cursor: pendingAction !== null || !isConfigured ? 'not-allowed' : 'pointer',
          opacity: pendingAction !== null || !isConfigured ? 0.6 : 1,
        }}
      >
        {pendingAction === 'google' ? 'Redirecting to Google...' : 'Continue with Google'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
        <div style={{ flex: 1, height: 1, background: theme.border }} />
        <span style={{ color: theme.textMuted, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Or
        </span>
        <div style={{ flex: 1, height: 1, background: theme.border }} />
      </div>

      <form onSubmit={handleEmailAuth}>
        {mode === 'signup' && (
          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Full name</span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Jamie Lee"
              required
              style={inputStyle}
            />
          </label>
        )}

        <label style={{ display: 'block', marginBottom: 14 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 20 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === 'login' ? 'Enter your password' : 'Create a password'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={8}
            required
            style={inputStyle}
          />
        </label>

        <button
          type="submit"
          disabled={pendingAction !== null || !isConfigured}
          style={{
            width: '100%',
            height: 50,
            border: 'none',
            borderRadius: 14,
            background: theme.accent,
            color: '#ffffff',
            fontSize: 15,
            fontWeight: 700,
            cursor: pendingAction !== null || !isConfigured ? 'not-allowed' : 'pointer',
            opacity: pendingAction !== null || !isConfigured ? 0.6 : 1,
          }}
        >
          {pendingAction === 'email' ? 'Working...' : submitLabel}
        </button>
      </form>

      <div style={{ marginTop: 18, color: theme.textSubtle, fontSize: 13, lineHeight: 1.6 }}>
        After authentication, you will land on <span style={{ color: theme.text, fontWeight: 700 }}>{nextPath}</span>.
      </div>

      <div style={{ marginTop: 18 }}>
        <Link href={switchHref} style={{ color: '#93B4FF', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          {switchLabel}
        </Link>
      </div>

      <div style={{ marginTop: 24, color: theme.textMuted, fontSize: 12, lineHeight: 1.6 }}>
        By continuing, you agree to secure session handling and role-based access controls for your workspace.
      </div>
    </div>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  height: 46,
  borderRadius: 14,
  border: `1px solid ${theme.border}`,
  background: 'rgba(255,255,255,0.03)',
  color: theme.text,
  fontSize: 14,
  padding: '0 14px',
  outline: 'none',
}

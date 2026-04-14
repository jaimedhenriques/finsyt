'use client'

import Link from "next/link"
import { FormEvent, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSupabaseClient } from "@/lib/supabase/hooks"

type AuthMode = "login" | "signup"

type AuthCopy = {
  title: string
  subtitle: string
  submitLabel: string
  switchLabel: string
  switchCta: string
  switchHref: string
}

const COPY: Record<AuthMode, AuthCopy> = {
  login: {
    title: "Welcome back",
    subtitle: "Sign in to access research, company pages, and your watchlists.",
    submitLabel: "Sign in",
    switchLabel: "Don't have an account?",
    switchCta: "Create one",
    switchHref: "/app/auth/signup",
  },
  signup: {
    title: "Create your account",
    subtitle: "Get started with your institutional-grade financial workspace.",
    submitLabel: "Create account",
    switchLabel: "Already have an account?",
    switchCta: "Sign in",
    switchHref: "/app/auth/login",
  },
}

function normaliseRedirectPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/app")) return "/app/research"
  return raw
}

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useSupabaseClient()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const redirectPath = useMemo(
    () => normaliseRedirectPath(searchParams?.get("redirect")),
    [searchParams],
  )
  const copy = COPY[mode]

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      if (mode === "login") {
        if (!supabase) {
          setErrorMessage("Authentication is not configured. Add Supabase environment variables.")
          return
        }

        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.replace(redirectPath)
        router.refresh()
        return
      }

      if (!supabase) {
        setErrorMessage("Authentication is not configured. Add Supabase environment variables.")
        return
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/app/auth/callback?redirect=${encodeURIComponent(redirectPath)}`,
        },
      })

      if (error) throw error
      setStatusMessage("Check your email to confirm your account before signing in.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to complete authentication."
      setErrorMessage(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function onGoogleSignIn() {
    setSubmitting(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      if (!supabase) {
        setErrorMessage("Authentication is not configured. Add Supabase environment variables.")
        return
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/app/auth/callback?redirect=${encodeURIComponent(redirectPath)}`,
        },
      })
      if (error) throw error
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start Google sign-in."
      setErrorMessage(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%)",
        padding: "2rem 1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 16,
          border: "1px solid #dce6ff",
          background: "#ffffff",
          boxShadow: "0 24px 48px rgba(27, 79, 255, 0.08)",
          padding: "1.75rem",
        }}
      >
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0A1628", marginBottom: 6 }}>
          {copy.title}
        </h1>
        <p style={{ fontSize: 14, color: "#5f7394", marginBottom: "1.5rem", lineHeight: 1.45 }}>
          {copy.subtitle}
        </p>

        <button
          type="button"
          onClick={onGoogleSignIn}
          disabled={submitting}
          style={{
            width: "100%",
            borderRadius: 10,
            border: "1px solid #d5def2",
            background: "#ffffff",
            padding: "0.65rem 0.9rem",
            fontSize: 14,
            fontWeight: 600,
            color: "#1f2f4d",
            cursor: "pointer",
            marginBottom: 14,
          }}
        >
          Continue with Google
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ height: 1, flex: 1, background: "#e5ecfa" }} />
          <span style={{ fontSize: 12, color: "#8da0be" }}>or with email</span>
          <div style={{ height: 1, flex: 1, background: "#e5ecfa" }} />
        </div>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="input"
          />
          <input
            type="password"
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="input"
          />

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              borderRadius: 10,
              border: "none",
              background: "#1B4FFF",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              padding: "0.7rem 1rem",
              marginTop: 2,
            }}
          >
            {submitting ? "Please wait…" : copy.submitLabel}
          </button>
        </form>

        {errorMessage && (
          <p style={{ marginTop: 12, color: "#c73636", fontSize: 13, lineHeight: 1.4 }}>
            {errorMessage}
          </p>
        )}
        {statusMessage && (
          <p style={{ marginTop: 12, color: "#21673f", fontSize: 13, lineHeight: 1.4 }}>
            {statusMessage}
          </p>
        )}

        <p style={{ marginTop: 14, fontSize: 13, color: "#6f82a4" }}>
          {copy.switchLabel}{" "}
          <Link
            href={copy.switchHref}
            style={{ color: "#1B4FFF", fontWeight: 700, textDecoration: "none" }}
          >
            {copy.switchCta}
          </Link>
        </p>
      </div>
    </div>
  )
}

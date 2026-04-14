'use client'

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, type FormEvent } from "react"

import { createClient } from "@/lib/supabase/client"

type AuthMode = "login" | "signup"

type AuthFormProps = {
  mode: AuthMode
  nextPath: string
}

const copy = {
  login: {
    title: "Welcome back",
    subtitle: "Sign in to continue your research workflows, watchlists, and saved workspaces.",
    submit: "Sign in",
    switchLabel: "Need an account?",
    switchCta: "Create one",
    switchHref: "/app/auth/signup",
  },
  signup: {
    title: "Create your account",
    subtitle: "Start with a secure account foundation for your market data, alerts, and collaborative research.",
    submit: "Create account",
    switchLabel: "Already have an account?",
    switchCta: "Sign in",
    switchHref: "/app/auth/login",
  },
} satisfies Record<AuthMode, {
  title: string
  subtitle: string
  submit: string
  switchLabel: string
  switchCta: string
  switchHref: string
}>

function buildCallbackUrl(nextPath: string): string | null {
  if (typeof window === "undefined") return null

  const url = new URL("/app/auth/callback", window.location.origin)
  url.searchParams.set("next", nextPath)
  return url.toString()
}

export default function AuthForm({ mode, nextPath }: AuthFormProps) {
  const router = useRouter()
  const client = useMemo(() => createClient(), [])
  const configured = Boolean(client)
  const content = copy[mode]
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)

    if (!client) {
      setError("Authentication is not configured yet. Add Supabase public env vars to enable sign-in.")
      return
    }

    setLoading(true)

    try {
      if (mode === "login") {
        const { error: signInError } = await client.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError

        router.replace(nextPath)
        router.refresh()
        return
      }

      const callbackUrl = buildCallbackUrl(nextPath)
      const { data, error: signUpError } = await client.auth.signUp({
        email,
        password,
        options: callbackUrl ? { emailRedirectTo: callbackUrl } : undefined,
      })

      if (signUpError) throw signUpError

      if (data.session) {
        router.replace(nextPath)
        router.refresh()
        return
      }

      setMessage("Check your inbox to confirm your email address before signing in.")
    } catch (authError) {
      const nextError = authError instanceof Error ? authError.message : "Authentication failed."
      setError(nextError)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleAuth() {
    setError(null)
    setMessage(null)

    if (!client) {
      setError("Authentication is not configured yet. Add Supabase public env vars to enable Google sign-in.")
      return
    }

    const redirectTo = buildCallbackUrl(nextPath)
    if (!redirectTo) {
      setError("Unable to start Google sign-in from this environment.")
      return
    }

    setLoading(true)

    const { error: oauthError } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    })

    if (oauthError) {
      setError(oauthError.message)
      setLoading(false)
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.15fr) minmax(360px, 520px)",
        background: "#05111f",
        color: "#f8fafc",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <section
        style={{
          padding: "64px clamp(32px, 7vw, 88px)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at top left, rgba(27,79,255,0.28), transparent 38%), linear-gradient(180deg, #061120 0%, #040b16 100%)",
          borderRight: "1px solid rgba(148, 163, 184, 0.14)",
        }}
      >
        <div>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              color: "#f8fafc",
              textDecoration: "none",
              marginBottom: 48,
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "linear-gradient(135deg, #1b4fff, #0d9fe8)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                letterSpacing: "-0.03em",
              }}
            >
              F
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em" }}>Finsyt</span>
          </Link>

          <div style={{ maxWidth: 560 }}>
            <p
              style={{
                margin: 0,
                color: "#8fb2ff",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Secure platform access
            </p>
            <h1
              style={{
                margin: "18px 0 16px",
                fontSize: "clamp(44px, 5vw, 68px)",
                lineHeight: 1.02,
                letterSpacing: "-0.05em",
              }}
            >
              Financial intelligence, with account-level security.
            </h1>
            <p style={{ margin: 0, color: "rgba(226, 232, 240, 0.72)", fontSize: 18, lineHeight: 1.75 }}>
              Protect saved research, team workflows, and subscription-gated surfaces with secure sessions built on Supabase.
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            maxWidth: 520,
          }}
        >
          {[
            "Email/password and Google sign-in",
            "Secure server-side session checks for protected routes",
            "Shared session context ready for feature gating and billing",
          ].map((item) => (
            <div
              key={item}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                borderRadius: 16,
                background: "rgba(15, 23, 42, 0.45)",
                border: "1px solid rgba(148, 163, 184, 0.14)",
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(16, 185, 129, 0.18)",
                  color: "#34d399",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                ✓
              </span>
              <span style={{ color: "rgba(226, 232, 240, 0.82)", fontSize: 14 }}>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          padding: "48px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            background: "#ffffff",
            border: "1px solid rgba(148, 163, 184, 0.24)",
            boxShadow: "0 24px 80px rgba(15, 23, 42, 0.12)",
            borderRadius: 28,
            padding: 32,
            color: "#0f172a",
          }}
        >
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.04em" }}>{content.title}</h2>
            <p style={{ margin: "10px 0 0", color: "#475569", lineHeight: 1.6 }}>{content.subtitle}</p>
          </div>

          {!configured && (
            <div
              style={{
                marginBottom: 18,
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid rgba(245, 158, 11, 0.28)",
                background: "rgba(255, 251, 235, 0.8)",
                color: "#92400e",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Supabase public env vars are missing on this environment, so sign-in controls stay disabled until they are configured.
            </div>
          )}

          {error && (
            <div
              style={{
                marginBottom: 18,
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid rgba(239, 68, 68, 0.18)",
                background: "rgba(254, 242, 242, 0.95)",
                color: "#b91c1c",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {message && (
            <div
              style={{
                marginBottom: 18,
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid rgba(37, 99, 235, 0.16)",
                background: "rgba(239, 246, 255, 0.95)",
                color: "#1d4ed8",
                fontSize: 13,
              }}
            >
              {message}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={loading || !configured}
            style={{
              width: "100%",
              height: 48,
              borderRadius: 14,
              border: "1px solid rgba(148, 163, 184, 0.28)",
              background: "#ffffff",
              color: "#0f172a",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading || !configured ? "not-allowed" : "pointer",
              opacity: loading || !configured ? 0.58 : 1,
            }}
          >
            Continue with Google
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
            <div style={{ height: 1, flex: 1, background: "rgba(148, 163, 184, 0.24)" }} />
            <span style={{ color: "#64748b", fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Or
            </span>
            <div style={{ height: 1, flex: 1, background: "rgba(148, 163, 184, 0.24)" }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="analyst@finsyt.com"
                autoComplete="email"
                required
                disabled={loading || !configured}
                style={{
                  height: 48,
                  borderRadius: 14,
                  border: "1px solid rgba(148, 163, 184, 0.36)",
                  padding: "0 14px",
                  fontSize: 14,
                  color: "#0f172a",
                  background: "#ffffff",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter a secure password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={8}
                disabled={loading || !configured}
                style={{
                  height: 48,
                  borderRadius: 14,
                  border: "1px solid rgba(148, 163, 184, 0.36)",
                  padding: "0 14px",
                  fontSize: 14,
                  color: "#0f172a",
                  background: "#ffffff",
                }}
              />
            </label>

            <button
              type="submit"
              disabled={loading || !configured}
              style={{
                width: "100%",
                height: 50,
                borderRadius: 14,
                border: "none",
                background: "linear-gradient(135deg, #1b4fff, #0d9fe8)",
                color: "#ffffff",
                fontSize: 15,
                fontWeight: 700,
                cursor: loading || !configured ? "not-allowed" : "pointer",
                opacity: loading || !configured ? 0.64 : 1,
                marginTop: 6,
              }}
            >
              {loading ? "Working..." : content.submit}
            </button>
          </form>

          <p style={{ margin: "18px 0 0", color: "#475569", fontSize: 14 }}>
            {content.switchLabel}{" "}
            <Link
              href={`${content.switchHref}?next=${encodeURIComponent(nextPath)}`}
              style={{ color: "#1b4fff", fontWeight: 600, textDecoration: "none" }}
            >
              {content.switchCta}
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}

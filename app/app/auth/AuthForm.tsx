'use client'

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState, type FormEvent } from "react"

import { useSupabaseAuthState, useSupabaseBrowser } from "@/lib/supabase/hooks"

type AuthMode = "login" | "signup"

const COPY: Record<
  AuthMode,
  {
    title: string
    subtitle: string
    submitLabel: string
    alternateHref: string
    alternateLabel: string
    alternateCta: string
  }
> = {
  login: {
    title: "Welcome back",
    subtitle: "Sign in to continue into your Finsyt workspace.",
    submitLabel: "Sign in",
    alternateHref: "/app/auth/signup",
    alternateLabel: "Need an account?",
    alternateCta: "Create one",
  },
  signup: {
    title: "Create your account",
    subtitle: "Start with email or continue with Google.",
    submitLabel: "Create account",
    alternateHref: "/app/auth/login",
    alternateLabel: "Already have an account?",
    alternateCta: "Sign in",
  },
}

function sanitiseNextPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith("/")) return "/app"
  if (!nextPath.startsWith("/app")) return "/app"
  if (nextPath.startsWith("/app/auth")) return "/app"
  return nextPath
}

function normaliseErrorMessage(message: string) {
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Your email or password is incorrect."
  }

  if (message.toLowerCase().includes("email not confirmed")) {
    return "Check your inbox and confirm your email before signing in."
  }

  return message
}

function getQueryErrorMessage(queryError: string | null) {
  if (!queryError) return null

  if (queryError === "missing_config") {
    return "Supabase auth is not configured in this environment yet."
  }

  if (queryError === "oauth_callback") {
    return "Google sign-in could not be completed. Please try again."
  }

  if (queryError === "oauth_exchange") {
    return "The sign-in link expired or could not be exchanged. Please try again."
  }

  return queryError
}

function getQuerySuccessMessage(callbackMessage: string | null) {
  if (callbackMessage === "check_email") {
    return "Check your inbox to finish creating your account."
  }

  return null
}

export default function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useSupabaseBrowser()
  const { isConfigured, isLoading, user } = useSupabaseAuthState()
  const copy = COPY[mode]
  const nextPath = sanitiseNextPath(searchParams.get("next"))
  const queryError = searchParams.get("error")
  const callbackMessage = searchParams.get("message")
  const queryErrorMessage = useMemo(() => getQueryErrorMessage(queryError), [queryError])
  const querySuccessMessage = useMemo(
    () => getQuerySuccessMessage(callbackMessage),
    [callbackMessage],
  )
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isPending, setIsPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const oauthRedirectUrl = useMemo(() => {
    if (typeof window === "undefined") return ""

    const url = new URL("/app/auth/callback", window.location.origin)
    url.searchParams.set("next", nextPath)
    return url.toString()
  }, [nextPath])

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(nextPath)
      router.refresh()
    }
  }, [isLoading, nextPath, router, user])

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabase) {
      setErrorMessage("Supabase auth is not configured in this environment yet.")
      return
    }

    setIsPending(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setErrorMessage(normaliseErrorMessage(error.message))
        setIsPending(false)
        return
      }

      router.replace(nextPath)
      router.refresh()
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: oauthRedirectUrl || undefined,
      },
    })

    if (error) {
      setErrorMessage(normaliseErrorMessage(error.message))
      setIsPending(false)
      return
    }

    if (data.session) {
      router.replace(nextPath)
      router.refresh()
      return
    }

    setSuccessMessage("Check your inbox to confirm your email and finish signing in.")
    setIsPending(false)
  }

  async function handleGoogleAuth() {
    if (!supabase) {
      setErrorMessage("Supabase auth is not configured in this environment yet.")
      return
    }

    setIsPending(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: oauthRedirectUrl,
      },
    })

    if (error) {
      setErrorMessage(normaliseErrorMessage(error.message))
      setIsPending(false)
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1rem",
        background:
          "radial-gradient(circle at top, rgba(27,79,255,0.24), transparent 32%), #080E1A",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 460,
          padding: 32,
          borderColor: "rgba(255,255,255,0.08)",
          background: "#0F1929",
          color: "#E2E8F0",
          boxShadow: "0 30px 80px rgba(8,14,26,0.45)",
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
              color: "#FFFFFF",
              marginBottom: 18,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: "linear-gradient(135deg,#1B4FFF,#0D9FE8)",
                display: "grid",
                placeItems: "center",
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              F
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em" }}>Finsyt</span>
          </Link>
          <h1 style={{ fontSize: 30, lineHeight: 1.1, letterSpacing: "-0.04em", marginBottom: 8 }}>
            {copy.title}
          </h1>
          <p style={{ color: "rgba(226,232,240,0.68)", fontSize: 14 }}>{copy.subtitle}</p>
        </div>

        {!isConfigured && (
          <div
            style={{
              marginBottom: 18,
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(245,158,11,0.12)",
              border: "1px solid rgba(245,158,11,0.22)",
              color: "#FCD34D",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Supabase environment variables are missing, so sign-in is disabled until the deployment is configured.
          </div>
        )}

        {(errorMessage || queryErrorMessage || successMessage || querySuccessMessage) && (
          <div
            style={{
              marginBottom: 18,
              padding: "12px 14px",
              borderRadius: 12,
              background: errorMessage || queryErrorMessage ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)",
              border: errorMessage || queryErrorMessage
                ? "1px solid rgba(239,68,68,0.22)"
                : "1px solid rgba(16,185,129,0.22)",
              color: errorMessage || queryErrorMessage ? "#FCA5A5" : "#6EE7B7",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {errorMessage || queryErrorMessage || successMessage || querySuccessMessage}
          </div>
        )}

        <button
          type="button"
          className="btn btn-outline"
          onClick={handleGoogleAuth}
          disabled={!isConfigured || isPending}
          style={{
            width: "100%",
            justifyContent: "center",
            marginBottom: 18,
            background: "transparent",
            color: "#E2E8F0",
            borderColor: "rgba(255,255,255,0.14)",
          }}
        >
          Continue with Google
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 18,
            color: "rgba(226,232,240,0.42)",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          <div style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.08)" }} />
          <span>or use email</span>
          <div style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.08)" }} />
        </div>

        <form onSubmit={handleEmailAuth}>
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Email</span>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@company.com"
                required
                style={{ background: "#08111F", color: "#FFFFFF", borderColor: "rgba(255,255,255,0.08)" }}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Password</span>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "login" ? "Enter your password" : "Create a secure password"}
                required
                minLength={8}
                style={{ background: "#08111F", color: "#FFFFFF", borderColor: "rgba(255,255,255,0.08)" }}
              />
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!isConfigured || isPending}
            style={{ width: "100%", justifyContent: "center", marginTop: 18, height: 44 }}
          >
            {isPending ? "Working..." : copy.submitLabel}
          </button>
        </form>

        <p style={{ marginTop: 18, textAlign: "center", fontSize: 13, color: "rgba(226,232,240,0.6)" }}>
          {copy.alternateLabel}{" "}
          <Link
            href={`${copy.alternateHref}?next=${encodeURIComponent(nextPath)}`}
            style={{ color: "#93B4FF", textDecoration: "none", fontWeight: 700 }}
          >
            {copy.alternateCta}
          </Link>
        </p>
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

export default function SignupPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const next = searchParams.get("next") || "/app/research"

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/app/auth/confirm`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  async function handleGoogleSignup() {
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/app/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    if (error) setError(error.message)
  }

  if (success) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F7FB", fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ width: "100%", maxWidth: 420, padding: "2.5rem", background: "#fff", borderRadius: 16, border: "1px solid #E2E8F2", boxShadow: "0 4px 24px rgba(0,0,0,0.06)", textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#059669" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
          </div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0A1628", marginBottom: "0.5rem" }}>Check your email</h2>
          <p style={{ color: "#7D8FA9", fontSize: "0.875rem", lineHeight: 1.6 }}>
            We sent a confirmation link to <strong style={{ color: "#1C2B4A" }}>{email}</strong>. Click it to activate your account.
          </p>
          <Link
            href="/app/auth/login"
            style={{ display: "inline-block", marginTop: "1.5rem", color: "#1B4FFF", fontWeight: 600, fontSize: "0.875rem", textDecoration: "none" }}
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F7FB", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 420, padding: "2.5rem", background: "#fff", borderRadius: 16, border: "1px solid #E2E8F2", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0A1628", letterSpacing: "-0.03em" }}>Finsyt</div>
          <p style={{ color: "#7D8FA9", fontSize: "0.875rem", marginTop: "0.5rem" }}>Create your account</p>
        </div>

        {error && (
          <div style={{ padding: "0.75rem 1rem", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, color: "#DC2626", fontSize: "0.8125rem", marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSignup}>
          <label style={{ display: "block", marginBottom: "1rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#1C2B4A", display: "block", marginBottom: "0.375rem" }}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              style={{ width: "100%", padding: "0.625rem 0.875rem", borderRadius: 8, border: "1px solid #E2E8F2", fontSize: "0.875rem", outline: "none", background: "#FAFBFD" }}
              onFocus={(e) => (e.target.style.borderColor = "#1B4FFF")}
              onBlur={(e) => (e.target.style.borderColor = "#E2E8F2")}
            />
          </label>

          <label style={{ display: "block", marginBottom: "1.5rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#1C2B4A", display: "block", marginBottom: "0.375rem" }}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="At least 6 characters"
              style={{ width: "100%", padding: "0.625rem 0.875rem", borderRadius: 8, border: "1px solid #E2E8F2", fontSize: "0.875rem", outline: "none", background: "#FAFBFD" }}
              onFocus={(e) => (e.target.style.borderColor = "#1B4FFF")}
              onBlur={(e) => (e.target.style.borderColor = "#E2E8F2")}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "0.7rem", borderRadius: 8, background: "#1B4FFF", color: "#fff", fontWeight: 600, fontSize: "0.875rem", border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1.25rem 0" }}>
          <div style={{ flex: 1, height: 1, background: "#E2E8F2" }} />
          <span style={{ fontSize: "0.75rem", color: "#7D8FA9", fontWeight: 500 }}>or</span>
          <div style={{ flex: 1, height: 1, background: "#E2E8F2" }} />
        </div>

        <button
          onClick={handleGoogleSignup}
          style={{ width: "100%", padding: "0.7rem", borderRadius: 8, background: "#fff", color: "#1C2B4A", fontWeight: 600, fontSize: "0.875rem", border: "1px solid #E2E8F2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
          onMouseOver={(e) => (e.currentTarget.style.background = "#F5F7FB")}
          onMouseOut={(e) => (e.currentTarget.style.background = "#fff")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>

        <p style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.8125rem", color: "#7D8FA9" }}>
          Already have an account?{" "}
          <Link href="/app/auth/login" style={{ color: "#1B4FFF", fontWeight: 600, textDecoration: "none" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

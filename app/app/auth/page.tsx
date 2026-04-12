"use client"

import type { FormEvent } from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

type Mode = "login" | "signup"

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const supabase = getSupabaseBrowserClient()

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    setMessage("")
    setLoading(true)

    try {
      if (!supabase) {
        throw new Error(
          "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        )
      }

      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) throw signUpError
        setMessage("Account created. Check your email for verification.")
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
        router.push("/app/workspaces")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0a0e1a",
        color: "#e8eaf0",
        fontFamily: "Inter, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#10182b",
          border: "1px solid #1d2a43",
          borderRadius: 14,
          padding: 24,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
          {mode === "login" ? "Sign in" : "Create account"}
        </h1>
        <p style={{ color: "#93a0ba", fontSize: 14, marginBottom: 18 }}>
          {mode === "login"
            ? "Access your protected workspace routes."
            : "Create your auth identity with Supabase."}
        </p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #2a3957",
                background: "#0d1527",
                color: "#e8eaf0",
              }}
            />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
            Password
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #2a3957",
                background: "#0d1527",
                color: "#e8eaf0",
              }}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #2b65ea",
              background: "#1b4fff",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Sign up"}
          </button>
        </form>

        {error && <p style={{ color: "#f87171", marginTop: 10, fontSize: 13 }}>{error}</p>}
        {message && <p style={{ color: "#34d399", marginTop: 10, fontSize: 13 }}>{message}</p>}

        <p style={{ marginTop: 16, fontSize: 13, color: "#93a0ba" }}>
          {mode === "login" ? "Need an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login")
              setError("")
              setMessage("")
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#60a5fa",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  )
}

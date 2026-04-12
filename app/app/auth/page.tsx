"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { getSupabaseEnv } from "@/lib/supabase/env"

type Mode = "login" | "signup"

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const config = useMemo(() => getSupabaseEnv(), [])
  const isConfigured = config.isConfigured
  const callbackError = useMemo(() => {
    if (typeof window === "undefined") return null
    return new URLSearchParams(window.location.search).get("error")
  }, [])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)

    if (!isConfigured) {
      setMessage("Supabase env is missing. Set URL + anon key first.")
      return
    }

    setIsLoading(true)
    const client = createSupabaseBrowserClient()

    if (mode === "login") {
      const { error } = await client.auth.signInWithPassword({ email, password })
      if (error) {
        setMessage(error.message)
        setIsLoading(false)
        return
      }
      router.replace("/app/research")
      router.refresh()
      return
    }

    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined
    const { error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage("Signup successful. Check your inbox to confirm your email.")
    }

    setIsLoading(false)
  }

  return (
    <div className="min-h-screen w-full bg-[#060e1e] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-blue-500/20 bg-[#0d1b32] p-6 shadow-xl">
        <h1 className="text-xl font-semibold">Finsyt Auth</h1>
        <p className="mt-1 text-sm text-white/60">
          {mode === "login" ? "Sign in to continue" : "Create your account"}
        </p>
        {callbackError ? (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {callbackError}
          </div>
        ) : null}

        {!isConfigured ? (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Missing Supabase config. Set `NEXT_PUBLIC_SUPABASE_URL` and
            `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
          </div>
        ) : null}

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <label className="block text-xs text-white/70">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-blue-500/20 bg-[#0a1525] px-3 py-2 text-sm text-white outline-none focus:border-blue-400/60"
              placeholder="you@company.com"
            />
          </label>

          <label className="block text-xs text-white/70">
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-blue-500/20 bg-[#0a1525] px-3 py-2 text-sm text-white outline-none focus:border-blue-400/60"
              placeholder="At least 6 characters"
            />
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-60"
          >
            {isLoading ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        {message ? <p className="mt-3 text-xs text-white/80">{message}</p> : null}

        <button
          type="button"
          onClick={() => {
            setMessage(null)
            setMode((prev) => (prev === "login" ? "signup" : "login"))
          }}
          className="mt-4 text-xs text-blue-300 hover:text-blue-200"
        >
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  )
}

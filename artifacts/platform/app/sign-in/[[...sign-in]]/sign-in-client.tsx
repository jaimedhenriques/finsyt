"use client"

import { useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import {
  AuthenticateWithRedirectCallback,
  useClerk,
  useSignIn,
} from "@clerk/nextjs"
import { SignInPage, type Testimonial } from "@/components/ui/sign-in"

const testimonials: Testimonial[] = [
  {
    avatarSrc: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&q=80",
    name: "Priya Raman",
    handle: "@priya.research",
    text: "Finsyt cut our screening turnaround from hours to minutes. The AI summaries are genuinely insight-grade.",
  },
  {
    avatarSrc: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&q=80",
    name: "Marcus Hale",
    handle: "@mhale.equities",
    text: "Cross-asset coverage and live event detection in one workspace — finally.",
  },
  {
    avatarSrc: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=160&q=80",
    name: "Sara Lindqvist",
    handle: "@sara.macro",
    text: "Replaces three terminals for my team and the audit trail is enterprise-ready.",
  },
]

export interface SignInClientProps {
  /**
   * Server-evaluated flag — true only in non-production environments
   * where the demo sign-in endpoint is reachable. Renders the
   * "Sign in as demo user" button + "Demo access" helper line.
   * In production this is `false` and no demo affordance is rendered
   * (no DOM node, no fetch, no flash on first paint).
   */
  demoEnabled: boolean
  demoEmail: string
  demoPasswordSecretName: string
}

export function SignInClient({
  demoEnabled,
  demoEmail,
  demoPasswordSecretName,
}: SignInClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams<{ "sign-in"?: string[] }>()
  const { isLoaded, signIn, setActive } = useSignIn()
  const clerk = useClerk()
  const [loading, setLoading] = useState(false)
  const [demoSubmitting, setDemoSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [mfaStage, setMfaStage] = useState<null | { emailAddressId: string; email: string }>(null)
  const [mfaCode, setMfaCode]   = useState("")

  const redirectUrl = searchParams.get("redirect_url") || "/platform/app"
  const targetUrl = redirectUrl.startsWith("/platform")
    ? redirectUrl
    : `/platform${redirectUrl.startsWith("/") ? "" : "/"}${redirectUrl}`

  // The optional catch-all also matches `/sign-in/sso-callback` — the URL
  // Clerk redirects back to after Google completes the OAuth round-trip.
  // That landing page MUST mount <AuthenticateWithRedirectCallback /> so
  // Clerk can read the handshake params, exchange them for a session, and
  // then forward to `redirectUrlComplete`. Without this, the user lands
  // back on the sign-in form with the OAuth params silently dropped — the
  // exact "Continue with Google does nothing" symptom we saw in prod.
  const segments = params?.["sign-in"] ?? []
  if (segments[0] === "sso-callback") {
    return (
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl="/platform/app"
        signUpFallbackRedirectUrl="/platform/app"
        signInForceRedirectUrl="/platform/app"
        signUpForceRedirectUrl="/platform/app"
      />
    )
  }

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isLoaded || !signIn) return
    setErrorMessage(null)
    setLoading(true)
    try {
      const formData = new FormData(event.currentTarget)
      const email = String(formData.get("email") || "").trim()
      const password = String(formData.get("password") || "")
      if (!email || !password) {
        setErrorMessage("Please enter your email and password.")
        return
      }
      const result = await signIn.create({ identifier: email, password })
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId })
        router.push(targetUrl)
      } else if (result.status === "needs_second_factor") {
        // Clerk instance enforces an email-code 2FA. Prepare it and prompt for the code.
        const second = result.supportedSecondFactors?.find(f => f.strategy === "email_code")
        const emailFactorId = (second as { emailAddressId?: string } | undefined)?.emailAddressId
        if (!emailFactorId) {
          setErrorMessage("Two-factor verification is required but no email factor is available on this account.")
          return
        }
        await signIn.prepareSecondFactor({ strategy: "email_code", emailAddressId: emailFactorId })
        setMfaStage({ emailAddressId: emailFactorId, email })
      } else {
        setErrorMessage(
          "Additional verification required. Please complete it in your email or contact your administrator.",
        )
      }
    } catch (err: unknown) {
      const msg =
        (err as { errors?: Array<{ message?: string; longMessage?: string }> })
          ?.errors?.[0]?.longMessage ??
        (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ??
        (err instanceof Error ? err.message : "Sign-in failed. Check your credentials and try again.")
      setErrorMessage(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    if (!isLoaded || !signIn) return
    setErrorMessage(null)
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/platform/sign-in/sso-callback",
        redirectUrlComplete: targetUrl,
      })
    } catch (err: unknown) {
      const msg =
        (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ??
        (err instanceof Error ? err.message : "Google sign-in failed.")
      setErrorMessage(msg)
    }
  }

  function handleResetPassword() {
    router.push("/platform/forgot-password")
  }

  function handleCreateAccount() {
    if (typeof window !== "undefined") {
      window.location.href = "/#waitlist"
    }
  }

  // Preview-only demo sign-in. Uses `useClerk()` (not the form's
  // `useSignIn` hook) because that hook's `isLoaded` flag is unreliable
  // in this Clerk version, which would keep the button perpetually
  // disabled. `window.location.assign` is used instead of `router.push`
  // so Next's basePath isn't double-applied to the absolute redirect.
  async function handleDemoSignIn() {
    setErrorMessage(null)
    setDemoSubmitting(true)
    try {
      const start = Date.now()
      while (!clerk.loaded && Date.now() - start < 10_000) {
        await new Promise((r) => setTimeout(r, 50))
      }
      if (!clerk.loaded) {
        setErrorMessage("Sign-in is still initializing. Please refresh and try again.")
        return
      }
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""
      const res = await fetch(`${basePath}/api/dev/demo-sign-in`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
      })
      if (!res.ok) {
        const detail = await res
          .json()
          .then((b: { message?: string }) => b?.message)
          .catch(() => null)
        setErrorMessage(
          detail ??
            `Demo sign-in is unavailable (HTTP ${res.status}). Check that DEMO_USER_PASSWORD is set and the seed has been run.`,
        )
        return
      }
      const body = (await res.json()) as { ticket: string; redirectUrl?: string }
      const result = await clerk.client.signIn.create({
        strategy: "ticket",
        ticket: body.ticket,
      })
      if (result.status === "complete" && result.createdSessionId) {
        await clerk.setActive({ session: result.createdSessionId })
        window.location.assign(body.redirectUrl || targetUrl)
      } else if (result.status === "needs_second_factor") {
        setErrorMessage(
          "The demo user has 2FA enabled. Re-run `pnpm --filter @workspace/scripts run seed:demo` to disable MFA, or sign in manually.",
        )
      } else {
        setErrorMessage(
          `Demo sign-in returned an unexpected status: ${result.status}.`,
        )
      }
    } catch (err: unknown) {
      const msg =
        (err as { errors?: Array<{ message?: string; longMessage?: string }> })
          ?.errors?.[0]?.longMessage ??
        (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ??
        (err instanceof Error ? err.message : "Demo sign-in failed.")
      setErrorMessage(msg)
    } finally {
      setDemoSubmitting(false)
    }
  }

  async function handleVerifyMfa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isLoaded || !signIn || !mfaStage) return
    setErrorMessage(null)
    setLoading(true)
    try {
      const result = await signIn.attemptSecondFactor({ strategy: "email_code", code: mfaCode.trim() })
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId })
        router.push(targetUrl)
      } else {
        setErrorMessage("Code accepted but sign-in is not complete. Please try again.")
      }
    } catch (err: unknown) {
      const msg =
        (err as { errors?: Array<{ message?: string; longMessage?: string }> })?.errors?.[0]?.longMessage ??
        (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ??
        (err instanceof Error ? err.message : "Verification failed.")
      setErrorMessage(msg)
    } finally {
      setLoading(false)
    }
  }

  if (mfaStage) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A1628", color: "#fff", padding: 24 }}>
        <form onSubmit={handleVerifyMfa} style={{ width: "100%", maxWidth: 420, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 16, padding: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Two-step verification</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 20 }}>
            We just emailed a 6-digit code to{" "}
            <strong>{mfaStage.email || "your email on file"}</strong>. Enter it below to finish signing in.
          </p>
          <input
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={mfaCode}
            onChange={e => setMfaCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            style={{ width: "100%", padding: "14px 16px", fontSize: 22, letterSpacing: "0.4em", textAlign: "center", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", marginBottom: 16 }}
          />
          {errorMessage && (
            <div style={{ fontSize: 13, color: "#FCA5A5", marginBottom: 14 }}>{errorMessage}</div>
          )}
          <button type="submit" disabled={loading || mfaCode.length < 6}
            style={{ width: "100%", padding: "12px 16px", borderRadius: 12, background: "#7C3AED", color: "#fff", fontWeight: 600, fontSize: 14, border: "none", cursor: loading ? "wait" : "pointer", opacity: (loading || mfaCode.length < 6) ? 0.6 : 1 }}>
            {loading ? "Verifying…" : "Verify and continue"}
          </button>
          <button type="button" onClick={() => { setMfaStage(null); setMfaCode(""); setErrorMessage(null) }}
            style={{ width: "100%", marginTop: 10, padding: "10px 16px", borderRadius: 12, background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 13, border: "1px solid rgba(255,255,255,0.10)", cursor: "pointer" }}>
            Use a different account
          </button>
        </form>
      </div>
    )
  }

  return (
    <SignInPage
      heroImageSrc="https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=2160&q=80"
      testimonials={testimonials}
      loading={!isLoaded}
      submitting={loading}
      errorMessage={errorMessage}
      onSignIn={handleSignIn}
      onGoogleSignIn={handleGoogleSignIn}
      onResetPassword={handleResetPassword}
      onCreateAccount={handleCreateAccount}
      demoSignIn={
        demoEnabled
          ? {
              email: demoEmail,
              passwordSecretName: demoPasswordSecretName,
              onClick: handleDemoSignIn,
              submitting: demoSubmitting,
            }
          : null
      }
    />
  )
}

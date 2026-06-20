"use client"

import React, { useState } from "react"
import { Eye, EyeOff } from "lucide-react"

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48">
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s12-5.373 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z"
    />
  </svg>
)

export interface Testimonial {
  avatarSrc: string
  name: string
  handle: string
  text: string
}

export interface DemoSignInOptions {
  email: string
  passwordSecretName: string
  onClick: () => void
  submitting?: boolean
}

export interface SignInPageProps {
  title?: React.ReactNode
  description?: React.ReactNode
  heroImageSrc?: string
  testimonials?: Testimonial[]
  loading?: boolean
  submitting?: boolean
  errorMessage?: string | null
  onSignIn?: (event: React.FormEvent<HTMLFormElement>) => void
  onGoogleSignIn?: () => void
  onResetPassword?: () => void
  onCreateAccount?: () => void
  demoSignIn?: DemoSignInOptions | null
}

const ACCENT = "#0035E5"

export const SignInPage: React.FC<SignInPageProps> = ({
  title,
  description = "Institutional-grade research, AI agents and live market data — built for the desks that can't afford to be wrong.",
  loading = false,
  submitting = false,
  errorMessage = null,
  onSignIn,
  onGoogleSignIn,
  onResetPassword,
  onCreateAccount,
  demoSignIn = null,
}) => {
  const [showPassword, setShowPassword] = useState(false)

  const renderedTitle =
    title ?? (
      <span className="block tracking-tight text-[#0A0B0E]">
        Accelerate your{" "}
        <span style={{ color: ACCENT }}>research workflow</span>
      </span>
    )

  return (
    <div
      data-theme="white"
      className="flex h-[100dvh] w-full flex-col bg-white text-[#0A0B0E] md:flex-row"
    >
      {/* ── Left: form ─────────────────────────────────────────────────── */}
      <section className="flex flex-1 items-center justify-center px-6 py-10 md:px-16">
        <div className="w-full max-w-md">
          {/* Wordmark */}
          <div className="mb-12 flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ background: ACCENT }}
            />
            <span className="text-lg font-semibold tracking-tight text-[#0A0B0E]">
              Finsyt
            </span>
          </div>

          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight md:text-[44px]">
            {renderedTitle}
          </h1>

          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[#4A5366]">
            {description}
          </p>

          <form className="mt-10 space-y-5" onSubmit={onSignIn}>
            <div>
              <label className="text-[12px] font-medium uppercase tracking-wider text-[#6B7488]">
                Work email
              </label>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@firm.com"
                className="mt-2 w-full rounded-md border border-[#D8DCE3] bg-white px-4 py-3 text-[15px] text-[#0A0B0E] placeholder-[#9CA3AF] outline-none transition-colors focus:border-[#0035E5]"
              />
            </div>

            <div>
              <label className="text-[12px] font-medium uppercase tracking-wider text-[#6B7488]">
                Password
              </label>
              <div className="relative mt-2">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  className="w-full rounded-md border border-[#D8DCE3] bg-white px-4 py-3 pr-12 text-[15px] text-[#0A0B0E] placeholder-[#9CA3AF] outline-none transition-colors focus:border-[#0035E5]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-[#6B7488] hover:text-[#0A0B0E]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-md border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]"
              >
                {errorMessage}
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-[#4A5366]">
                <input
                  type="checkbox"
                  name="rememberMe"
                  className="h-4 w-4 rounded border-[#D8DCE3] accent-[#0035E5]"
                />
                <span>Keep me signed in</span>
              </label>
              <button
                type="button"
                onClick={onResetPassword}
                className="font-medium text-[#0035E5] hover:underline"
              >
                Reset password
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || submitting}
              className="flex w-full items-center justify-center gap-2 rounded-md py-3.5 text-[15px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: ACCENT }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  "#0028B3")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  ACCENT)
              }
            >
              {submitting ? "Signing in…" : (
                <>
                  Sign In <span aria-hidden>→</span>
                </>
              )}
            </button>
          </form>

          <div className="my-7 flex items-center gap-3">
            <span className="h-px flex-1 bg-[#E6E9EF]" />
            <span className="text-xs uppercase tracking-wider text-[#8A93A6]">
              or
            </span>
            <span className="h-px flex-1 bg-[#E6E9EF]" />
          </div>

          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-md border border-[#D8DCE3] bg-white py-3.5 text-[15px] font-medium text-[#0A0B0E] transition-colors hover:bg-[#F4F7FB] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {demoSignIn && (
            <div
              data-testid="demo-sign-in"
              className="mt-4 rounded-md border border-dashed border-[#0035E5]/40 bg-[#F4F7FB] p-4"
            >
              <button
                type="button"
                onClick={demoSignIn.onClick}
                disabled={demoSignIn.submitting === true}
                data-testid="demo-sign-in-button"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-[#0035E5] bg-white py-3 text-[14px] font-semibold text-[#0035E5] transition-colors hover:bg-[#EEF2FF] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {demoSignIn.submitting ? "Signing in…" : "Sign in as demo user"}
              </button>
              <p className="mt-3 text-[12px] leading-relaxed text-[#4A5366]">
                <span className="font-semibold text-[#0A0B0E]">Demo access</span>{" "}
                — preview only. Email{" "}
                <span className="font-mono text-[#0A0B0E]">
                  {demoSignIn.email}
                </span>
                ; password lives in the{" "}
                <span className="font-mono text-[#0A0B0E]">
                  {demoSignIn.passwordSecretName}
                </span>{" "}
                Replit secret.
              </p>
            </div>
          )}

          <p className="mt-8 text-center text-sm text-[#4A5366]">
            New to Finsyt?{" "}
            <button
              type="button"
              onClick={onCreateAccount}
              className="font-semibold text-[#0035E5] hover:underline"
            >
              Request access →
            </button>
          </p>
        </div>
      </section>

      {/* ── Right: AlphaSense-style solid blue feature panel ─────────────── */}
      <section
        className="relative hidden flex-1 overflow-hidden lg:block"
        style={{ background: ACCENT }}
      >
        {/* subtle texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 85% 15%, rgba(255,255,255,0.35), transparent 45%), radial-gradient(circle at 15% 85%, rgba(255,255,255,0.25), transparent 50%)",
          }}
        />

        <div className="relative flex h-full flex-col px-10 py-10 xl:px-14 xl:py-12">
          {/* Eyebrow */}
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85">
            The AI research terminal
          </div>

          {/* Headline */}
          <div className="mt-8 max-w-xl">
            <div className="font-display text-[44px] font-bold leading-[0.98] tracking-[-0.025em] text-white xl:text-[52px]">
              Fundamentals.
              <br />
              And the agent that reads them.
            </div>
            <div className="mt-5 max-w-md text-[15px] leading-relaxed text-white/85">
              Ask anything. Cite everything. Move from question to memo without
              leaving the terminal.
            </div>
          </div>

          {/* Faux product surface — needs solid contrast against bright blue */}
          <div
            className="mt-10 w-full max-w-xl rounded-2xl border p-6 shadow-2xl"
            style={{
              background: "rgba(255,255,255,0.97)",
              borderColor: "rgba(255,255,255,0.4)",
              boxShadow: "0 30px 60px -20px rgba(0, 20, 80, 0.45)",
            }}
          >
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>
              Ask Finsyt
            </div>
            <div className="text-[19px] font-medium leading-snug tracking-tight text-[#0A0B0E] xl:text-[21px]">
              How did NVDA gross margin trend last 3 quarters — and what did
              management say about it?
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Auto", "Think Longer", "Deep Research", "Cite all"].map(
                (chip, i) => (
                  <span
                    key={chip}
                    className="rounded-full px-3 py-1.5 text-[11px] font-semibold"
                    style={
                      i === 0
                        ? { background: ACCENT, color: "#fff" }
                        : { background: "#F1F4FA", color: "#0A0B0E", border: "1px solid #E2E8F2" }
                    }
                  >
                    {chip}
                  </span>
                ),
              )}
            </div>
            <div className="mt-5 space-y-2">
              <div className="h-1.5 w-full rounded bg-[#E2E8F2]" />
              <div className="h-1.5 w-[92%] rounded bg-[#E2E8F2]" />
              <div className="h-1.5 w-[78%] rounded bg-[#E2E8F2]" />
              <div className="h-1.5 w-[58%] rounded bg-[#E2E8F2]" />
            </div>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {["10-K (NVDA)", "Q3 transcript", "estimates · 12 analysts"].map(
                (s) => (
                  <span
                    key={s}
                    className="rounded border border-[#E2E8F2] bg-[#F8FAFC] px-2 py-1 font-mono text-[10px] text-[#4A5568]"
                  >
                    {s}
                  </span>
                ),
              )}
            </div>
          </div>

          {/* spacer pushes stats to bottom */}
          <div className="flex-1" />

          {/* Bottom stats */}
          <div className="grid grid-cols-3 gap-6 border-t border-white/15 pt-6 text-white">
            {[
              { k: "6,500+", v: "Enterprise teams" },
              { k: "48 ms", v: "Median agent latency" },
              { k: "Cited", v: "Every fact, every answer" },
            ].map((s) => (
              <div key={s.v}>
                <div className="text-2xl font-bold tracking-tight">{s.k}</div>
                <div className="mt-1 text-[10.5px] uppercase tracking-[0.14em] text-white/75">
                  {s.v}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

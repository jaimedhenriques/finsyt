import type { Metadata } from "next"
import { headers } from "next/headers"
import { Inter, Inter_Tight } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
  display: "swap",
})

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--font-inter-tight",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Finsyt — Financial Intelligence Platform",
  description: "AI-powered financial intelligence for founders, operators and analysts.",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <ClerkProvider
      nonce={nonce}
      signInUrl="/platform/sign-in"
      signUpUrl="/platform/sign-up"
      signInFallbackRedirectUrl="/platform/app"
      signUpFallbackRedirectUrl="/platform/app"
      localization={{
        signIn: {
          start: {
            title: "Sign in to Finsyt",
            subtitle: "Access your financial intelligence workspace.",
          },
          emailCode: {
            title: "Check your email",
            subtitle: "We sent a verification code to {{identifier}} from auth@finsyt.com.",
            formTitle: "Verification code",
            resendButton: "Resend code",
          },
          password: {
            title: "Enter your password",
            subtitle: "Use your Finsyt password to continue.",
          },
          forgotPassword: {
            title: "Reset your password",
            subtitle_email: "We'll email a reset code to {{identifier}} from auth@finsyt.com.",
          },
        },
        signUp: {
          start: {
            title: "Create your Finsyt account",
            subtitle: "Get the financial intelligence your team needs.",
          },
          emailCode: {
            title: "Verify your email",
            subtitle: "We sent a verification code to {{identifier}} from auth@finsyt.com.",
            formTitle: "Verification code",
            resendButton: "Resend code",
          },
        },
        signInEnterPasswordTitle: "Enter your Finsyt password",
        signInForgotPasswordTitle: "Forgot your password?",
      }}
      appearance={{
        variables: {
          colorPrimary: "var(--accent)",
          colorBackground: "var(--bg-card)",
          colorInputBackground: "var(--bg-elevated)",
          colorText: "var(--text-primary)",
          colorTextSecondary: "var(--text-secondary)",
          colorInputText: "var(--text-primary)",
          colorNeutral: "var(--text-secondary)",
          borderRadius: "10px",
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        },
        elements: {
          rootBox: "w-full",
          cardBox: "rounded-2xl w-full overflow-hidden border border-[rgba(255,255,255,0.08)] shadow-[0_8px_40px_rgba(0,0,0,0.6)]",
          card: "!shadow-none !border-0 !bg-transparent !rounded-none",
          footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
        },
      }}
    >
      <html lang="en" className={`${inter.variable} ${interTight.variable}`} style={{ background: 'var(--bg-page)' }} suppressHydrationWarning>
        <head suppressHydrationWarning>
          {/* Apply saved theme before first paint to avoid a white flash for
              users who picked Cream / Light Gray / Black. Mirrors the logic in
              WorkspaceProvider — keep the allowed list in sync. */}
          <script
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{
              __html:
                "(function(){try{var t=localStorage.getItem('finsyt-theme');" +
                "if(!t||['cream','gray','dark','white'].indexOf(t)<0){t='white';}" +
                "document.documentElement.setAttribute('data-theme',t);}catch(e){" +
                "document.documentElement.setAttribute('data-theme','white');}})();",
            }}
          />
        </head>
        <body style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}

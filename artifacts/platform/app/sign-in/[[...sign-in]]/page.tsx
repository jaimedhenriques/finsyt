import { redirect } from "next/navigation"
import type { Metadata } from "next"
import {
  DEMO_PASSWORD_SECRET_NAME,
  DEMO_USER_EMAIL,
  isDemoSignInPreviewEnabled,
} from "@/lib/preview-env"
import { OPEN_MODE } from "@/lib/open-mode"
import { SignInClient } from "./sign-in-client"

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

/**
 * Server entry for `/platform/sign-in[/...]`.
 *
 * When `PLATFORM_OPEN_MODE=1`, the platform has no login wall — every
 * request resolves to the demo principal in `lib/open-mode.ts`. In that
 * mode we forward straight to `/platform/app` instead of rendering the
 * sign-in form so users never see a credentials page.
 *
 * Otherwise we render the normal client form. The "Sign in as demo user"
 * button + "Demo access" helper line are gated by
 * `isDemoSignInPreviewEnabled()` so the decision is made on the server,
 * baked into the SSR'd HTML, and not reachable from the client. In
 * production the prop is `false`, no DOM node is rendered, no fetch is
 * wired, and no flash on first paint is possible.
 */
export default async function SignInPageRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (OPEN_MODE) {
    // Targets are relative to the Next.js basePath ("/platform"), so do
    // NOT include the prefix — Next will add it. If a `redirect_url` was
    // forwarded from the protected-route guard, strip the leading
    // "/platform" before handing it back to redirect().
    const params = await searchParams
    const raw = params?.redirect_url
    const redirectParam = Array.isArray(raw) ? raw[0] : raw
    let target = "/app"
    if (redirectParam) {
      const stripped = redirectParam.startsWith("/platform")
        ? redirectParam.slice("/platform".length) || "/"
        : redirectParam
      if (stripped.startsWith("/")) target = stripped
    }
    redirect(target)
  }
  const demoEnabled = isDemoSignInPreviewEnabled()
  return (
    <SignInClient
      demoEnabled={demoEnabled}
      demoEmail={DEMO_USER_EMAIL}
      demoPasswordSecretName={DEMO_PASSWORD_SECRET_NAME}
    />
  )
}

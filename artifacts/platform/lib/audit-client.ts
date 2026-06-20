import { createHmac } from 'node:crypto'

/**
 * Server-side helper that proxies requests from the platform's Next.js
 * route handlers into the api-server's audit / retention / DSAR endpoints.
 *
 * Identity is injected here. Until the Clerk-based auth provider lands
 * (see SECURITY.md §7) we use a development-only demo identity.
 *
 * Requests are signed with HMAC-SHA256 using the shared
 * `INTERNAL_AUTH_SECRET` so the api-server can verify they originated
 * from a trusted first-party service (see api-server `actor.ts`).
 *
 * In production, `getDemoIdentity()` throws — the route handlers must
 * be wired to the real authenticated user/org before this module is
 * deployed to customers.
 */
const API_BASE = process.env.API_SERVER_URL
  || process.env.NEXT_PUBLIC_API_SERVER_URL
  || 'http://localhost:8080'

export interface Identity {
  orgId: string
  actorId: string
  role: 'owner' | 'admin' | 'member'
}

export function getDemoIdentity(): Identity {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_IDENTITY !== '1') {
    throw new Error(
      'getDemoIdentity() called in production. Wire the platform route ' +
      'handlers to the authenticated session before shipping.',
    )
  }
  return {
    orgId: 'org_helix_holdings',
    actorId: 'user_jaime_dhenriques',
    role: 'owner',
  }
}

function signIdentity(identity: Identity): { ts: string; sig: string } | null {
  const secret = process.env.INTERNAL_AUTH_SECRET
  if (!secret) return null
  const ts = String(Date.now())
  const sig = createHmac('sha256', secret)
    .update(`${identity.orgId}|${identity.actorId}|${identity.role}|${ts}`)
    .digest('hex')
  return { ts, sig }
}

/**
 * Returns a JSON 503 response when no real session is wired in. Use at
 * the top of every route handler so the demo identity can never serve
 * production traffic by accident even if `ALLOW_DEMO_IDENTITY` slips
 * into a deployed environment.
 */
export function refuseInProduction(): Response | null {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_IDENTITY !== '1') {
    return new Response(
      JSON.stringify({
        error: 'Service Unavailable',
        message:
          'Audit / DSAR endpoints require an authenticated session. ' +
          'Enable real auth (Roadmap §7.1) before exposing this surface.',
      }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )
  }
  return null
}

export async function apiServerFetch(
  path: string,
  init: RequestInit = {},
  identity: Identity = getDemoIdentity(),
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('x-org-id', identity.orgId)
  headers.set('x-actor-id', identity.actorId)
  headers.set('x-actor-role', identity.role)
  const signed = signIdentity(identity)
  if (signed) {
    headers.set('x-actor-ts', signed.ts)
    headers.set('x-actor-sig', signed.sig)
  }
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  return fetch(`${API_BASE}/api${path}`, { ...init, headers, cache: 'no-store' })
}

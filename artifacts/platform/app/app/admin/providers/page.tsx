import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth-server'
import ProvidersAdminClient from './_client'

type ClerkClaims = {
  org_role?: string
  'o.rol'?: string
} & Record<string, unknown>

/**
 * Server-side admin gate for /app/admin/providers.
 *
 * Mirrors the API-route gate in /api/admin/providers/health/route.ts so a
 * non-admin can never reach the page shell — they are redirected to /sign-in
 * (anon) or /app (signed in but lacking admin claim).
 */
export default async function ProvidersAdminPage() {
  const { userId, sessionClaims } = await auth()
  if (!userId) redirect('/sign-in?redirect_url=/platform/app/admin/providers')

  const allowList = (process.env.ADMIN_USER_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  const inAllowList = allowList.includes(userId)
  const claims = (sessionClaims ?? {}) as ClerkClaims
  const orgRole = claims.org_role || claims['o.rol'] || ''
  const isOrgAdmin = ['org:admin', 'admin', 'org:owner', 'owner']
    .includes(String(orgRole))
  const explicitDevBypass = process.env.ADMIN_HEALTH_DEV_BYPASS === '1'
    && process.env.NODE_ENV !== 'production'

  if (!(inAllowList || isOrgAdmin || explicitDevBypass)) {
    redirect('/app?error=admin_only')
  }

  return <ProvidersAdminClient />
}

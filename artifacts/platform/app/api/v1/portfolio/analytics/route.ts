import { NextRequest, NextResponse } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalAnalytics } from '@/app/api/portfolio/analytics/route'

export const runtime = 'nodejs'

/**
 * Public mirror of /api/portfolio/analytics. Note: the underlying handler
 * requires a Clerk session because positions are workspace-scoped. When
 * called via the public API (no Clerk session), the upstream returns
 * 401/409. The mirror is registered for symmetry and so the OpenAPI / MCP
 * surface is uniform — once we add per-key portfolio scoping (issue #99 +
 * the API-key portfolio path), this becomes a usable endpoint.
 */
export const GET = withPublicApi(
  async (req) => {
    const inner = await callInternalGet(internalAnalytics, req, ['benchmark', 'days', 'riskFreeRate'])
    if (inner.status === 401 || inner.status === 409) {
      return NextResponse.json({
        error: 'portfolio analytics requires a workspace session; the public API mirror is reserved for future per-key portfolio scoping',
      }, { status: 501 })
    }
    return inner
  },
  { endpoint: '/v1/portfolio/analytics' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

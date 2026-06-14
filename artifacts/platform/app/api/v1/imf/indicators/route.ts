import { NextRequest } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalIndicators } from '@/app/api/imf/indicators/route'

export const runtime = 'nodejs'

export const GET = withPublicApi(
  async (req) => callInternalGet(internalIndicators, req, ['q', 'dataset', 'limit', 'featured']),
  { endpoint: '/v1/imf/indicators' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

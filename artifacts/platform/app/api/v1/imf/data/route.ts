import { NextRequest } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalData } from '@/app/api/imf/data/route'

export const runtime = 'nodejs'

export const GET = withPublicApi(
  async (req) => callInternalGet(internalData, req, ['indicator', 'country']),
  { endpoint: '/v1/imf/data' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

import { NextRequest } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalReference } from '@/app/api/rates/reference/route'

export const runtime = 'nodejs'

export const GET = withPublicApi(
  async (req) => callInternalGet(internalReference, req, []),
  { endpoint: '/v1/rates/reference' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

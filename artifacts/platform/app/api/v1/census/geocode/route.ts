import { NextRequest } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalGeocode } from '@/app/api/census/geocode/route'

export const runtime = 'nodejs'

export const GET = withPublicApi(
  async (req) => callInternalGet(internalGeocode, req, ['address']),
  { endpoint: '/v1/census/geocode' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

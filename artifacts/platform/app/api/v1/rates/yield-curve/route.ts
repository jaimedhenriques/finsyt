import { NextRequest } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalYieldCurve } from '@/app/api/rates/yield-curve/route'

export const runtime = 'nodejs'

export const GET = withPublicApi(
  async (req) => callInternalGet(internalYieldCurve, req, ['date']),
  { endpoint: '/v1/rates/yield-curve' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

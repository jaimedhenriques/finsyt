import { NextRequest } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalCreditSpreads } from '@/app/api/rates/credit-spreads/route'

export const runtime = 'nodejs'

export const GET = withPublicApi(
  async (req) => callInternalGet(internalCreditSpreads, req, ['periods']),
  { endpoint: '/v1/rates/credit-spreads' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

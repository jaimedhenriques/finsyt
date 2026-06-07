import { NextRequest } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalAggregate } from '@/app/api/census/aggregate/route'

export const runtime = 'nodejs'

export const GET = withPublicApi(
  async (req) => callInternalGet(internalAggregate, req, ['dataset', 'vintage', 'get', 'for', 'in', 'ucgid']),
  { endpoint: '/v1/census/aggregate' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

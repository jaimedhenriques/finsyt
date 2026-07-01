import { NextRequest } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalGroups } from '@/app/api/census/groups/route'

export const runtime = 'nodejs'

export const GET = withPublicApi(
  async (req) => callInternalGet(internalGroups, req, ['dataset', 'vintage', 'q', 'limit']),
  { endpoint: '/v1/census/groups' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

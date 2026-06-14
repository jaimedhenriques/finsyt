import { NextRequest } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalVariables } from '@/app/api/census/variables/route'

export const runtime = 'nodejs'

export const GET = withPublicApi(
  async (req) => callInternalGet(internalVariables, req, ['dataset', 'vintage', 'group', 'q', 'limit']),
  { endpoint: '/v1/census/variables' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

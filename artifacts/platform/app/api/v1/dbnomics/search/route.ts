import { NextRequest } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalSearch } from '@/app/api/dbnomics/search/route'

export const runtime = 'nodejs'

export const GET = withPublicApi(
  async (req) => callInternalGet(internalSearch, req, ['q', 'limit']),
  { endpoint: '/v1/dbnomics/search' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

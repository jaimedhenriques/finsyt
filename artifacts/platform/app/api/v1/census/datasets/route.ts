import { NextRequest } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalDatasets } from '@/app/api/census/datasets/route'

export const runtime = 'nodejs'

export const GET = withPublicApi(
  async (req) => callInternalGet(internalDatasets, req, ['q', 'vintage', 'limit']),
  { endpoint: '/v1/census/datasets' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

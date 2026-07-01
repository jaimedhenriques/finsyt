import { NextRequest } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalSeries } from '@/app/api/dbnomics/series/route'

export const runtime = 'nodejs'

export const GET = withPublicApi(
  async (req) => callInternalGet(internalSeries, req, ['id', 'provider', 'dataset', 'series', 'featured']),
  { endpoint: '/v1/dbnomics/series' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

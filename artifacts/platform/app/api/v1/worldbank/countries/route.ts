import { NextRequest } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalCountries } from '@/app/api/worldbank/countries/route'

export const runtime = 'nodejs'

export const GET = withPublicApi(
  async (req) => callInternalGet(internalCountries, req, ['q', 'region', 'incomeLevel', 'limit']),
  { endpoint: '/v1/worldbank/countries' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

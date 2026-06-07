import { NextRequest, NextResponse } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalDcfGet, POST as internalDcfPost } from '@/app/api/dcf/route'
import { INTERNAL_BYPASS_HEADER, internalBypassHeaderValue } from '@/lib/internal-auth'

export const runtime = 'nodejs'

export const GET = withPublicApi(
  async (req) => callInternalGet(internalDcfGet, req, [
    'baseFcf', 'growthStage1', 'growthStage2', 'stage1Years', 'stage2Years',
    'terminalGrowth', 'discountRate', 'netDebt', 'sharesOutstanding',
    'terminalExitMultiple', 'sensitivity',
  ]),
  { endpoint: '/v1/dcf' },
)

export const POST = withPublicApi(
  async (req) => {
    const body = await req.text()
    // After successful API-key auth in withPublicApi, attach the in-process
    // internal-bypass token so /api/dcf POST will skip its Clerk check.
    // The token never leaves this Node.js process (see lib/internal-auth.ts).
    const fakeReq = new NextRequest('http://internal/api/dcf', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [INTERNAL_BYPASS_HEADER]: internalBypassHeaderValue(),
      },
      body,
    })
    const internalRes = await internalDcfPost(fakeReq)
    const text = await internalRes.text()
    let json: unknown
    try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
    return NextResponse.json(json as object, { status: internalRes.status })
  },
  { endpoint: '/v1/dcf' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

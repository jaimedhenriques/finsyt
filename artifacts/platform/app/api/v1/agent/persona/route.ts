import { NextRequest, NextResponse } from 'next/server'
import { withPublicApi, callInternalGet, corsPreflight } from '@/lib/api-key-auth'
import { GET as internalPersonaGet, POST as internalPersonaPost } from '@/app/api/agent/persona/route'
import { INTERNAL_BYPASS_HEADER, internalBypassHeaderValue } from '@/lib/internal-auth'

export const runtime = 'nodejs'

export const GET = withPublicApi(
  async (req) => callInternalGet(internalPersonaGet, req, ['id']),
  { endpoint: '/v1/agent/persona' },
)

export const POST = withPublicApi(
  async (req) => {
    const body = await req.text()
    // withPublicApi has already validated the Bearer API key. Attach the
    // in-process bypass token so /api/agent/persona POST skips Clerk auth.
    // The token never leaves this Node.js process (see lib/internal-auth.ts).
    const fakeReq = new NextRequest('http://internal/api/agent/persona', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [INTERNAL_BYPASS_HEADER]: internalBypassHeaderValue(),
      },
      body,
    })
    const internalRes = await internalPersonaPost(fakeReq)
    const text = await internalRes.text()
    let json: unknown
    try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
    return NextResponse.json(json as object, { status: internalRes.status })
  },
  { endpoint: '/v1/agent/persona' },
)

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}

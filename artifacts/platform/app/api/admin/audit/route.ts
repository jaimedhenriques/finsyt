import { NextRequest, NextResponse } from 'next/server'
import { apiServerFetch, refuseInProduction } from '@/lib/audit-client'

export async function GET(req: NextRequest) {
  const refused = refuseInProduction()
  if (refused) return refused
  const search = req.nextUrl.searchParams.toString()
  const r = await apiServerFetch(`/admin/audit${search ? `?${search}` : ''}`)
  const body = await r.text()
  return new NextResponse(body, {
    status: r.status,
    headers: { 'content-type': r.headers.get('content-type') || 'application/json' },
  })
}

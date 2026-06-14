import { NextRequest, NextResponse } from 'next/server'
import { apiServerFetch, refuseInProduction } from '@/lib/audit-client'

export async function GET(req: NextRequest) {
  const refused = refuseInProduction()
  if (refused) return refused
  const search = req.nextUrl.searchParams.toString()
  const r = await apiServerFetch(`/admin/audit/export.csv${search ? `?${search}` : ''}`)
  const body = await r.arrayBuffer()
  return new NextResponse(body, {
    status: r.status,
    headers: {
      'content-type': r.headers.get('content-type') || 'text/csv',
      'content-disposition': r.headers.get('content-disposition') || 'attachment; filename="audit.csv"',
    },
  })
}

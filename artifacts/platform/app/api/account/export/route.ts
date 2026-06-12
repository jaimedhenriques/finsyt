import { NextResponse } from 'next/server'
import { apiServerFetch, refuseInProduction } from '@/lib/audit-client'

export async function POST() {
  const refused = refuseInProduction()
  if (refused) return refused
  const r = await apiServerFetch('/account/export', { method: 'POST' })
  const body = await r.arrayBuffer()
  return new NextResponse(body, {
    status: r.status,
    headers: {
      'content-type': r.headers.get('content-type') || 'application/json',
      'content-disposition': r.headers.get('content-disposition') || 'attachment; filename="finsyt-data-export.json"',
    },
  })
}
